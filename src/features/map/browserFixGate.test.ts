import { describe, expect, it } from "vitest";

import { createBrowserFixGate } from "./browserFixGate";

const BASE = { lat: 47.62, lon: -122.34 };
const north = (m: number) => BASE.lat + m / 111_195;

describe("createBrowserFixGate", () => {
  it("accepts the first fix and rejects an identical one", () => {
    const gate = createBrowserFixGate();
    expect(gate.check({ ...BASE, accuracy: 9 }, 0).accept).toBe(true);
    expect(gate.check({ ...BASE, accuracy: 9 }, 1_000).accept).toBe(false);
  });

  it("moves at least max(3 m, half the accuracy)", () => {
    const gate = createBrowserFixGate();
    gate.check({ ...BASE, accuracy: 5 }, 0);
    expect(gate.check({ lat: north(2), lon: BASE.lon, accuracy: 5 }, 1_000).accept).toBe(false);
    expect(gate.check({ lat: north(4), lon: BASE.lon, accuracy: 5 }, 2_000).accept).toBe(true);
    expect(gate.check({ lat: north(8), lon: BASE.lon, accuracy: 20 }, 3_000).accept).toBe(false);
    expect(gate.check({ lat: north(20), lon: BASE.lon, accuracy: 20 }, 4_000).accept).toBe(true);
  });

  it("caps the movement threshold at 10 m however poor the accuracy", () => {
    const gate = createBrowserFixGate();
    gate.check({ ...BASE, accuracy: 100 }, 0);
    expect(gate.check({ lat: north(9), lon: BASE.lon, accuracy: 100 }, 1_000).accept).toBe(false);
    expect(gate.check({ lat: north(11), lon: BASE.lon, accuracy: 100 }, 2_000).accept).toBe(true);
  });

  it.each([30, 60, 100])("keeps a dot walking north at 1.4 m/s within 10 m and 8 s at %i m accuracy", (accuracy) => {
    const gate = createBrowserFixGate();
    let shownAt = 0;
    let shownMeters = 0;
    for (let t = 0; t <= 120; t += 1) {
      const meters = 1.4 * t;
      const { accept } = gate.check({ lat: north(meters), lon: BASE.lon, accuracy }, t * 1_000);
      if (accept) {
        shownAt = t;
        shownMeters = meters;
      }
      expect(meters - shownMeters).toBeLessThanOrEqual(10);
      expect(t - shownAt).toBeLessThanOrEqual(8);
    }
  });

  it("accepts accuracy getting worse by 20 m or more", () => {
    const gate = createBrowserFixGate();
    gate.check({ ...BASE, accuracy: 5 }, 0);
    expect(gate.check({ ...BASE, accuracy: 24 }, 1_000).accept).toBe(false);
    expect(gate.check({ ...BASE, accuracy: 60 }, 2_000).accept).toBe(true);
    // The anchor is now 60 m: a return to 5 m is an improvement of 55 m, allowed once 5 s have passed.
    expect(gate.check({ ...BASE, accuracy: 5 }, 7_000).accept).toBe(true);
  });

  it("accepts a single 5 to 60 m worsening at once", () => {
    const gate = createBrowserFixGate();
    gate.check({ ...BASE, accuracy: 5 }, 0);
    expect(gate.check({ ...BASE, accuracy: 60 }, 1_000).accept).toBe(true);
  });

  it("caps accuracy-only redraws at one per 5 s when accuracy flickers 40/65 m at 1 Hz with the phone still", () => {
    const gate = createBrowserFixGate();
    let accepted = 0;
    let report = null;
    for (let t = 0; t <= 30; t += 1) {
      const result = gate.check({ ...BASE, accuracy: t % 2 === 0 ? 40 : 65 }, t * 1_000);
      if (result.accept) accepted += 1;
      report = result.report ?? report;
    }
    expect(accepted).toBeLessThanOrEqual(7);
    expect(report).toEqual(expect.objectContaining({ received: 31, rejected: expect.any(Number) }));
    expect(report?.rejected).toBeGreaterThanOrEqual(24);
  });

  it("accepts a real 40 to 25 m improvement more than 5 s after the last accuracy-only accept", () => {
    const gate = createBrowserFixGate();
    gate.check({ ...BASE, accuracy: 40 }, 0);
    expect(gate.check({ ...BASE, accuracy: 65 }, 1_000).accept).toBe(true);
    expect(gate.check({ ...BASE, accuracy: 40 }, 3_000).accept).toBe(false);
    expect(gate.check({ ...BASE, accuracy: 40 }, 7_000).accept).toBe(true);
    expect(gate.check({ ...BASE, accuracy: 25 }, 13_000).accept).toBe(true);
  });

  it("still accepts movement inside the 5 s accuracy-only window", () => {
    const gate = createBrowserFixGate();
    gate.check({ ...BASE, accuracy: 40 }, 0);
    expect(gate.check({ ...BASE, accuracy: 65 }, 1_000).accept).toBe(true);
    expect(gate.check({ lat: north(15), lon: BASE.lon, accuracy: 65 }, 2_000).accept).toBe(true);
    expect(gate.check({ lat: north(15), lon: BASE.lon, accuracy: 40 }, 3_000).accept).toBe(false);
  });

  it("accepts a forced fix and anchors on it", () => {
    const gate = createBrowserFixGate();
    gate.check({ ...BASE, accuracy: 9 }, 0);
    expect(gate.check({ lat: north(1), lon: BASE.lon, accuracy: 9 }, 1_000, true).accept).toBe(true);
    expect(gate.check({ lat: north(1), lon: BASE.lon, accuracy: 9 }, 2_000).accept).toBe(false);
  });

  it("accepts the next fix when the clock moves back and restarts the report period", () => {
    const gate = createBrowserFixGate();
    const hour = 3_600_000;
    gate.check({ ...BASE, accuracy: 9 }, hour);
    expect(gate.check({ ...BASE, accuracy: 9 }, hour + 1_000).accept).toBe(false);
    expect(gate.check({ ...BASE, accuracy: 9 }, 5_000).accept).toBe(true);
    expect(gate.check({ ...BASE, accuracy: 9 }, 6_000).accept).toBe(false);
    // The period restarted at the clock change: 1 accepted + 30 rejected over 30 s.
    let report = null;
    for (let t = 7_000; t <= 35_000; t += 1_000) report = gate.check({ ...BASE, accuracy: 9 }, t).report ?? report;
    expect(report).toEqual({ received: 31, rejected: 29, periodMs: 30_000 });
  });

  it("accepts a 10 m accuracy improvement and handles missing accuracy", () => {
    const gate = createBrowserFixGate();
    gate.check({ ...BASE, accuracy: 40 }, 0);
    expect(gate.check({ ...BASE, accuracy: 31 }, 1_000).accept).toBe(false);
    expect(gate.check({ ...BASE, accuracy: 30 }, 2_000).accept).toBe(true);
    expect(gate.check({ ...BASE }, 3_000).accept).toBe(false);
  });

  it("reports received and rejected once per 30 s and only when something was rejected", () => {
    const gate = createBrowserFixGate();
    const reports = [];
    for (let t = 0; t <= 30_000; t += 1_000) {
      const { report } = gate.check({ ...BASE, accuracy: 9 }, t);
      if (report) reports.push(report);
    }
    expect(reports).toEqual([{ received: 31, rejected: 29, periodMs: 30_000 }]);
    expect(gate.check({ lat: north(100), lon: BASE.lon, accuracy: 9 }, 60_000).report).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  computeEffectiveStatusClient,
  formatTimeRemaining,
  formatVotePct,
  haversineDistanceMiles,
} from "./routeVoteUtils";

// ---------------------------------------------------------------------------
// formatTimeRemaining
// ---------------------------------------------------------------------------

describe("formatTimeRemaining", () => {
  it("returns 'Expired' when expiresAt is in the past", () => {
    expect(formatTimeRemaining(Date.now() - 1000)).toBe("Expired");
  });

  it("returns 'Expired' for expiresAt exactly equal to now", () => {
    expect(formatTimeRemaining(Date.now())).toBe("Expired");
  });

  it("returns minutes remaining when under an hour", () => {
    const result = formatTimeRemaining(Date.now() + 25 * 60 * 1000);
    expect(result).toMatch(/25m remaining/);
  });

  it("returns hours and minutes remaining when under a day", () => {
    const result = formatTimeRemaining(Date.now() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000);
    expect(result).toMatch(/2h 15m remaining/);
  });

  it("returns days and hours remaining when over a day", () => {
    const result = formatTimeRemaining(Date.now() + 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000);
    expect(result).toMatch(/2d 3h remaining/);
  });
});

// ---------------------------------------------------------------------------
// computeEffectiveStatusClient
// ---------------------------------------------------------------------------

describe("computeEffectiveStatusClient", () => {
  const past = Date.now() - 60_000;
  const future = Date.now() + 60_000;

  it("returns 'closed' for an active vote whose expiresAt has passed", () => {
    expect(computeEffectiveStatusClient("active", past)).toBe("closed");
  });

  it("returns 'active' for an active vote that has not expired", () => {
    expect(computeEffectiveStatusClient("active", future)).toBe("active");
  });

  it.each(["draft", "closed", "resolved", "cancelled", "archived"] as const)(
    "passes through '%s' regardless of expiresAt",
    (status) => {
      expect(computeEffectiveStatusClient(status, past)).toBe(status);
      expect(computeEffectiveStatusClient(status, future)).toBe(status);
    },
  );
});

// ---------------------------------------------------------------------------
// formatVotePct
// ---------------------------------------------------------------------------

describe("formatVotePct", () => {
  it("returns '0%' when total is 0", () => {
    expect(formatVotePct(0, 0)).toBe("0%");
    expect(formatVotePct(5, 0)).toBe("0%");
  });

  it("returns the correct percentage rounded to the nearest integer", () => {
    expect(formatVotePct(1, 4)).toBe("25%");
    expect(formatVotePct(2, 3)).toBe("67%");
    expect(formatVotePct(3, 3)).toBe("100%");
  });
});

// ---------------------------------------------------------------------------
// haversineDistanceMiles
// ---------------------------------------------------------------------------

describe("haversineDistanceMiles", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistanceMiles(47.6, -122.3, 47.6, -122.3)).toBe(0);
  });

  it("returns a positive distance for distinct points", () => {
    const d = haversineDistanceMiles(47.6062, -122.3321, 47.6205, -122.3493);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(2);
  });

  it("returns a roughly correct distance for Seattle to NYC (~2,402 miles)", () => {
    const d = haversineDistanceMiles(47.6062, -122.3321, 40.7128, -74.006);
    expect(d).toBeGreaterThan(2300);
    expect(d).toBeLessThan(2500);
  });
});

import { describe, expect, it } from "vitest";
import {
  AUTO_TICK_MS,
  computeAutoState,
  getMinuteOfDayInTimeZone,
  getPhaseAtMinute,
  type AutoStateInputs,
} from "./autoStateCalc";

const DEFAULT_SETTINGS = {
  autoTimeZone: "UTC",
  autoBedtimeMinutes: 23 * 60,
  autoWakeTimeMinutes: 9 * 60,
  autoEnergyMin: 0,
  autoEnergyMax: 100,
  autoStomachMin: 0,
  autoStomachMax: 150,
  autoEnergySleepDeltaPerTick: 1,
  autoEnergyAwakeDeltaPerTick: -1,
  autoStomachAwakeDeltaPerTick: -2,
  autoStomachNightAboveHungryEveryTicks: 2,
  autoStomachNightAtOrBelowHungryEveryTicks: 4,
};

function makeInputs(overrides: Partial<AutoStateInputs> = {}): AutoStateInputs {
  // 12:00 UTC on 2024-06-15 — squarely in daytime under default 23:00–09:00 night window.
  const baseTime = Date.UTC(2024, 5, 15, 12, 0, 0);
  return {
    ...DEFAULT_SETTINGS,
    baseEnergy: 60,
    baseStomach: 80,
    autoEnabledAt: baseTime,
    targetTime: baseTime,
    ...overrides,
  };
}

describe("computeAutoState", () => {
  it("returns base values when no ticks have elapsed", () => {
    const r = computeAutoState(makeInputs());
    expect(r.elapsedTicks).toBe(0);
    expect(r.estimatedEnergy).toBe(60);
    expect(r.estimatedStomach).toBe(80);
  });

  it("clamps a negative elapsed window to zero ticks", () => {
    const base = Date.UTC(2024, 5, 15, 12, 0, 0);
    const r = computeAutoState(
      makeInputs({ autoEnabledAt: base, targetTime: base - 5 * AUTO_TICK_MS }),
    );
    expect(r.elapsedTicks).toBe(0);
    expect(r.estimatedEnergy).toBe(60);
  });

  it("one daytime tick drops energy by 1 and stomach by 2", () => {
    const base = makeInputs();
    const r = computeAutoState({ ...base, targetTime: base.autoEnabledAt + AUTO_TICK_MS });
    expect(r.elapsedTicks).toBe(1);
    expect(r.estimatedEnergy).toBe(59);
    expect(r.estimatedStomach).toBe(78);
  });

  it("one night tick raises energy by 1 and leaves stomach unchanged (above-hungry path)", () => {
    // 02:00 UTC — inside night window.
    const start = Date.UTC(2024, 5, 15, 2, 0, 0);
    const r = computeAutoState(
      makeInputs({
        autoEnabledAt: start,
        targetTime: start + AUTO_TICK_MS,
        baseStomach: 80,
      }),
    );
    expect(r.elapsedTicks).toBe(1);
    expect(r.estimatedEnergy).toBe(61);
    expect(r.estimatedStomach).toBe(80);
  });

  it("two night ticks above the hungry threshold drop stomach by 1", () => {
    const start = Date.UTC(2024, 5, 15, 2, 0, 0);
    const r = computeAutoState(
      makeInputs({
        autoEnabledAt: start,
        targetTime: start + 2 * AUTO_TICK_MS,
        baseStomach: 80,
      }),
    );
    expect(r.elapsedTicks).toBe(2);
    expect(r.estimatedStomach).toBe(79);
  });

  it("four night ticks at-or-below threshold drop stomach by 1 (slow decay)", () => {
    const start = Date.UTC(2024, 5, 15, 2, 0, 0);
    const r = computeAutoState(
      makeInputs({
        autoEnabledAt: start,
        targetTime: start + 4 * AUTO_TICK_MS,
        baseStomach: 40,
      }),
    );
    expect(r.elapsedTicks).toBe(4);
    expect(r.estimatedStomach).toBe(39);
  });

  it("crosses the hungry threshold and switches to slow path", () => {
    // base 51 above. 2 ticks above-threshold → 50. Then 4 ticks under → 49.
    const start = Date.UTC(2024, 5, 15, 2, 0, 0);
    const r = computeAutoState(
      makeInputs({
        autoEnabledAt: start,
        targetTime: start + 6 * AUTO_TICK_MS,
        baseStomach: 51,
      }),
    );
    expect(r.elapsedTicks).toBe(6);
    expect(r.estimatedStomach).toBe(49);
  });

  it("recognizes phase windows that cross midnight", () => {
    // bedtime 23:00, wake 09:00 → 02:00 is night.
    expect(getPhaseAtMinute(2 * 60, 23 * 60, 9 * 60)).toBe("night");
    // 09:30 is in the wake window (09:00..10:00).
    expect(getPhaseAtMinute(9 * 60 + 30, 23 * 60, 9 * 60)).toBe("wake");
    // 12:00 is daytime.
    expect(getPhaseAtMinute(12 * 60, 23 * 60, 9 * 60)).toBe("daytime");
    // 23:30 wraps into night.
    expect(getPhaseAtMinute(23 * 60 + 30, 23 * 60, 9 * 60)).toBe("night");
  });

  it("caps energy at autoEnergyMax inside the loop", () => {
    // 8 night ticks of +1, base 95, max 100 — should cap at 100, not drift to 103.
    const start = Date.UTC(2024, 5, 15, 2, 0, 0);
    const r = computeAutoState(
      makeInputs({
        autoEnabledAt: start,
        targetTime: start + 8 * AUTO_TICK_MS,
        baseEnergy: 95,
        autoEnergyMin: 0,
        autoEnergyMax: 100,
        baseStomach: 80,
      }),
    );
    expect(r.estimatedEnergy).toBe(100);
  });

  it("floors energy at autoEnergyMin inside the loop", () => {
    const start = Date.UTC(2024, 5, 15, 12, 0, 0);
    const r = computeAutoState(
      makeInputs({
        autoEnabledAt: start,
        targetTime: start + 30 * AUTO_TICK_MS,
        baseEnergy: 10,
        autoEnergyMin: 5,
        autoEnergyMax: 100,
      }),
    );
    // Energy can't go below 5.
    expect(r.estimatedEnergy).toBe(5);
  });

  it("phase label/emoji reflects the target time, not the last tick start", () => {
    // Enabled at 22:50 UTC, target at 02:00 UTC the next day — target is night.
    const start = Date.UTC(2024, 5, 15, 22, 50, 0);
    const target = Date.UTC(2024, 5, 16, 2, 0, 0);
    const r = computeAutoState(
      makeInputs({ autoEnabledAt: start, targetTime: target }),
    );
    expect(r.phase).toBe("night");
    expect(r.phaseLabel).toBe("Night");
    expect(r.phaseEmoji).toBe("🛏️");
  });

  it("uses different timezones to produce different phases for the same UTC moment", () => {
    // 2024-06-15T19:00:00Z is 12:00 PT (daytime) and 21:00 CEST (still daytime by default).
    // Move the bedtime such that LA is daytime but Paris is into night.
    const ts = Date.UTC(2024, 5, 15, 19, 0, 0);
    const laMinute = getMinuteOfDayInTimeZone(ts, "America/Los_Angeles");
    const parisMinute = getMinuteOfDayInTimeZone(ts, "Europe/Paris");
    expect(laMinute).toBe(12 * 60);
    expect(parisMinute).toBe(21 * 60);
    // Bedtime 20:00 — Paris is past bedtime, LA is not.
    expect(getPhaseAtMinute(laMinute, 20 * 60, 9 * 60)).toBe("daytime");
    expect(getPhaseAtMinute(parisMinute, 20 * 60, 9 * 60)).toBe("night");
  });

  it("getMinuteOfDayInTimeZone returns correct wall clock minutes", () => {
    const ts = Date.UTC(2024, 5, 15, 19, 0, 0);
    expect(getMinuteOfDayInTimeZone(ts, "America/Los_Angeles")).toBe(12 * 60);
    expect(getMinuteOfDayInTimeZone(ts, "Europe/Paris")).toBe(21 * 60);
    expect(getMinuteOfDayInTimeZone(ts, "UTC")).toBe(19 * 60);
  });

  it("produces a deterministic 24-hour phase sweep against the stored tz", () => {
    // Start at 00:00 UTC; 96 ticks of 15 min each = 24 hours.
    const start = Date.UTC(2024, 5, 15, 0, 0, 0);
    // 23:00 bedtime, 09:00 wake.
    const phases: string[] = [];
    for (let i = 0; i < 96; i++) {
      const minute = getMinuteOfDayInTimeZone(start + i * AUTO_TICK_MS, "UTC");
      phases.push(getPhaseAtMinute(minute, 23 * 60, 9 * 60));
    }
    // 00:00–08:45 (36 ticks) night, 09:00–09:45 (4 ticks) wake, 10:00–22:45 (52 ticks)
    // daytime, 23:00–23:45 (4 ticks) night → 96 total.
    expect(phases.slice(0, 36).every((p) => p === "night")).toBe(true);
    expect(phases.slice(36, 40).every((p) => p === "wake")).toBe(true);
    expect(phases.slice(40, 92).every((p) => p === "daytime")).toBe(true);
    expect(phases.slice(92, 96).every((p) => p === "night")).toBe(true);
  });

  it("survives a DST spring-forward without skipping ticks", () => {
    // US spring-forward 2024-03-10 02:00 PT → 03:00 PT. Enable at 01:30 PT,
    // target 04:30 PT (about 2 wall-clock hours later, but 3h elapsed in UTC).
    // 09:30 UTC == 01:30 PST (UTC-8), 12:30 UTC == 04:30 PDT.
    const start = Date.UTC(2024, 2, 10, 9, 30, 0);
    const target = Date.UTC(2024, 2, 10, 12, 30, 0);
    const r = computeAutoState(
      makeInputs({
        autoEnabledAt: start,
        targetTime: target,
        autoTimeZone: "America/Los_Angeles",
        baseEnergy: 60,
        baseStomach: 80,
      }),
    );
    // Elapsed: 3 hours * 4 ticks = 12 ticks (UTC-driven, no double-count).
    expect(r.elapsedTicks).toBe(12);
  });
});

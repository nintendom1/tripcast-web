// ---------------------------------------------------------------------------
// Auto State calculation helper
//
// Pure, deterministic, integer-only. No React, no Convex. Shared by Traveler
// and Follower clients. Phase windows are computed against the Traveler's
// stored IANA timezone — never the viewer's browser tz — so every viewer sees
// the same phase progression regardless of where they are physically.
// ---------------------------------------------------------------------------

export const AUTO_TICK_MS = 15 * 60 * 1000;
const WAKE_WINDOW_MINUTES = 60;
const STOMACH_NIGHT_HUNGRY_THRESHOLD = 50;
const MINUTES_PER_DAY = 1440;

export type AutoStatePhase = "night" | "wake" | "daytime";

export const PHASE_META: Record<AutoStatePhase, { label: string; emoji: string }> = {
  night: { label: "Night", emoji: "🛏️" },
  wake: { label: "Wake", emoji: "🌅" },
  daytime: { label: "Daytime", emoji: "☀️" },
};

export interface AutoStateSettings {
  autoTimeZone: string;
  autoBedtimeMinutes: number;
  autoWakeTimeMinutes: number;
  autoEnergyMin: number;
  autoEnergyMax: number;
  autoStomachMin: number;
  autoStomachMax: number;
  autoEnergySleepDeltaPerTick: number;
  autoEnergyAwakeDeltaPerTick: number;
  autoStomachAwakeDeltaPerTick: number;
  autoStomachNightAboveHungryEveryTicks: number;
  autoStomachNightAtOrBelowHungryEveryTicks: number;
}

export interface AutoStateInputs extends AutoStateSettings {
  baseEnergy: number;
  baseStomach: number;
  autoEnabledAt: number;
  targetTime: number;
}

export interface AutoStateResult {
  estimatedEnergy: number;
  estimatedStomach: number;
  elapsedTicks: number;
  phase: AutoStatePhase;
  phaseLabel: string;
  phaseEmoji: string;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function inWindow(minute: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return minute >= start && minute < end;
  // Window wraps midnight.
  return minute >= start || minute < end;
}

/**
 * Returns the wall-clock minute-of-day (0..1439) for the given UTC ms,
 * projected into the supplied IANA timezone.
 *
 * Uses Intl.DateTimeFormat which handles DST transitions automatically.
 */
export function getMinuteOfDayInTimeZone(timestamp: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

/**
 * Classifies a minute-of-day into night / wake / daytime, honoring midnight
 * crossings (e.g. bedtime=23:00 wakeTime=09:00).
 */
export function getPhaseAtMinute(
  minuteOfDay: number,
  bedtimeMinutes: number,
  wakeTimeMinutes: number,
): AutoStatePhase {
  const wakeWindowEnd = (wakeTimeMinutes + WAKE_WINDOW_MINUTES) % MINUTES_PER_DAY;
  if (inWindow(minuteOfDay, bedtimeMinutes, wakeTimeMinutes)) return "night";
  if (inWindow(minuteOfDay, wakeTimeMinutes, wakeWindowEnd)) return "wake";
  return "daytime";
}

/**
 * Integer-only per-tick estimation. Inputs are immutable; outputs reflect the
 * estimated values and the phase of the target time itself (not the last tick).
 */
export function computeAutoState(inputs: AutoStateInputs): AutoStateResult {
  const {
    baseEnergy,
    baseStomach,
    autoEnabledAt,
    targetTime,
    autoTimeZone,
    autoBedtimeMinutes,
    autoWakeTimeMinutes,
    autoEnergyMin,
    autoEnergyMax,
    autoStomachMin,
    autoStomachMax,
    autoEnergySleepDeltaPerTick,
    autoEnergyAwakeDeltaPerTick,
    autoStomachAwakeDeltaPerTick,
    autoStomachNightAboveHungryEveryTicks,
    autoStomachNightAtOrBelowHungryEveryTicks,
  } = inputs;

  const elapsedMs = targetTime - autoEnabledAt;
  const elapsedTicks = elapsedMs > 0 ? Math.floor(elapsedMs / AUTO_TICK_MS) : 0;

  let energy = clamp(baseEnergy, autoEnergyMin, autoEnergyMax);
  let stomach = clamp(baseStomach, autoStomachMin, autoStomachMax);
  let nightTicksSinceLastDecrement = 0;

  for (let i = 0; i < elapsedTicks; i++) {
    const tickStart = autoEnabledAt + i * AUTO_TICK_MS;
    const minute = getMinuteOfDayInTimeZone(tickStart, autoTimeZone);
    const phase = getPhaseAtMinute(minute, autoBedtimeMinutes, autoWakeTimeMinutes);

    if (phase === "night") {
      energy += autoEnergySleepDeltaPerTick;
      nightTicksSinceLastDecrement += 1;
      const everyTicks =
        stomach > STOMACH_NIGHT_HUNGRY_THRESHOLD
          ? autoStomachNightAboveHungryEveryTicks
          : autoStomachNightAtOrBelowHungryEveryTicks;
      if (nightTicksSinceLastDecrement >= everyTicks) {
        stomach -= 1;
        nightTicksSinceLastDecrement = 0;
      }
    } else {
      energy += autoEnergyAwakeDeltaPerTick;
      stomach += autoStomachAwakeDeltaPerTick;
      nightTicksSinceLastDecrement = 0;
    }

    energy = clamp(energy, autoEnergyMin, autoEnergyMax);
    stomach = clamp(stomach, autoStomachMin, autoStomachMax);
  }

  // Phase reflects the target time itself, not the last tick start.
  const targetMinute = getMinuteOfDayInTimeZone(targetTime, autoTimeZone);
  const phase = getPhaseAtMinute(targetMinute, autoBedtimeMinutes, autoWakeTimeMinutes);

  return {
    estimatedEnergy: energy,
    estimatedStomach: stomach,
    elapsedTicks,
    phase,
    phaseLabel: PHASE_META[phase].label,
    phaseEmoji: PHASE_META[phase].emoji,
  };
}

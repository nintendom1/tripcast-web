import type {
  TravelerMoodValue,
  TravelerEnergyLevel,
  TravelerStomachLevel,
  TravelerStressLevel,
  TravelerSchedulePressureLevel,
  TravelerStateFields,
} from "../../convex/tripcastApi";

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const MOOD_LABELS: Record<TravelerMoodValue, string> = {
  hopeful: "Hopeful",
  good: "Good",
  surprised: "Surprised",
  okay: "Okay",
  melancholy: "Melancholy",
  anxious: "Anxious",
  rough: "Rough",
  disappointed: "Disappointed",
  why_did_i_bother: "Why did I bother",
};

// Worst on the left, best on the right (#12)
export const MOOD_VALUES: TravelerMoodValue[] = [
  "why_did_i_bother",
  "disappointed",
  "rough",
  "anxious",
  "melancholy",
  "okay",
  "surprised",
  "good",
  "hopeful",
];

export const ENERGY_LABELS: Record<TravelerEnergyLevel, string> = {
  very_low: "Very Low",
  low: "Low",
  medium: "Medium",
  high: "High",
  very_high: "Very High",
};

export const ENERGY_VALUES: TravelerEnergyLevel[] = [
  "very_low",
  "low",
  "medium",
  "high",
  "very_high",
];

export const STOMACH_LABELS: Record<TravelerStomachLevel, string> = {
  starving: "Starving",
  famished: "Famished",
  hungry: "Hungry",
  satisfied: "Satisfied",
  full: "Full",
  stuffed: "Stuffed",
  overate: "Overate",
};

export const STOMACH_VALUES: TravelerStomachLevel[] = [
  "starving",
  "famished",
  "hungry",
  "satisfied",
  "full",
  "stuffed",
  "overate",
];

export const STRESS_LABELS: Record<TravelerStressLevel, string> = {
  calm: "Calm",
  mild: "Mild",
  stressed: "Stressed",
  overwhelmed: "Overwhelmed",
};

export const STRESS_VALUES: TravelerStressLevel[] = [
  "calm",
  "mild",
  "stressed",
  "overwhelmed",
];

export const SCHEDULE_LABELS: Record<TravelerSchedulePressureLevel, string> = {
  ahead: "Ahead",
  comfortable: "Comfortable",
  tight: "Tight",
  rushed: "Rushed",
  behind: "Behind",
};

// Worst on the left, best on the right (#12)
export const SCHEDULE_VALUES: TravelerSchedulePressureLevel[] = [
  "behind",
  "rushed",
  "tight",
  "comfortable",
  "ahead",
];

// ---------------------------------------------------------------------------
// Emoji mappings
// ---------------------------------------------------------------------------

export const MOOD_EMOJI: Record<TravelerMoodValue, string> = {
  hopeful: "🙂",
  good: "😊",
  surprised: "😲",
  okay: "😐",
  melancholy: "😔",
  anxious: "😰",
  rough: "😵‍💫",
  disappointed: "😞",
  why_did_i_bother: "🫠",
};

export function getMoodEmoji(mood: TravelerMoodValue | undefined): string {
  if (!mood) return "🧍";
  return MOOD_EMOJI[mood];
}

export function getStateEmoji(state: Partial<TravelerStateFields> | null): string {
  if (!state) return "🧍";
  if (state.moodValue) return MOOD_EMOJI[state.moodValue];
  if (state.energyLevel === "very_low" || state.energyLevel === "low") return "😴";
  if (state.stomachLevel === "starving" || state.stomachLevel === "famished") return "😫";
  if (state.stomachLevel === "stuffed" || state.stomachLevel === "overate") return "🥴";
  if (state.stomachLevel === "satisfied") return "😌";
  return "🧍";
}

// ---------------------------------------------------------------------------
// Score ↔ level bidirectional mapping (#5)
// ---------------------------------------------------------------------------

// Energy: 5 equal bands across 0-100
export const ENERGY_SCORE_FOR_LEVEL: Record<TravelerEnergyLevel, number> = {
  very_low: 10,
  low: 30,
  medium: 50,
  high: 70,
  very_high: 100,
};

export function getEnergyLevelFromScore(score: number): TravelerEnergyLevel {
  if (score <= 20) return "very_low";
  if (score <= 40) return "low";
  if (score <= 60) return "medium";
  if (score <= 90) return "high";
  return "very_high";
}

// Stress: 4 equal bands across 0-100
export const STRESS_SCORE_FOR_LEVEL: Record<TravelerStressLevel, number> = {
  calm: 12,
  mild: 37,
  stressed: 62,
  overwhelmed: 87,
};

export function getStressLevelFromScore(score: number): TravelerStressLevel {
  if (score <= 25) return "calm";
  if (score <= 50) return "mild";
  if (score <= 75) return "stressed";
  return "overwhelmed";
}

// Stomach: 7 levels across 0-150
export const STOMACH_SCORE_FOR_LEVEL: Record<TravelerStomachLevel, number> = {
  starving: 5,
  famished: 25,
  hungry: 50,
  satisfied: 80,
  full: 100,
  stuffed: 125,
  overate: 150,
};

// ---------------------------------------------------------------------------
// Stomach level mapping
// ---------------------------------------------------------------------------
//
// The legacy 10-pt/hr stomach decay was removed when Auto State landed.
// Auto State is now the explicit drift mechanism. With Auto off, Stomach
// displays as the last manually-saved value with no implicit decay.

export function getStomachLevelFromScore(score: number): TravelerStomachLevel {
  if (score <= 12) return "starving";
  if (score <= 37) return "famished";
  if (score <= 65) return "hungry";
  if (score <= 90) return "satisfied";
  if (score <= 100) return "full";
  if (score <= 135) return "stuffed";
  return "overate";
}

// ---------------------------------------------------------------------------
// Relative time
// ---------------------------------------------------------------------------

export function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

// ---------------------------------------------------------------------------
// Default visibility
// ---------------------------------------------------------------------------

export const DEFAULT_VISIBILITY = {
  showTravelerState: true,
  showTravelerClock: true,
  showMood: true,
  showEnergy: true,
  showStomach: true,
  showStress: true,
  showSchedulePressure: true,
  showStatusNote: true,
  showBiometrics: false,
};

// ---------------------------------------------------------------------------
// Auto State helpers — time-of-day formatting / parsing
// ---------------------------------------------------------------------------

/** Format minutes-from-midnight as "11:00 PM" / "9:00 AM". */
export function formatTimeOfDay(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${period}`;
}

/** Parse "HH:MM" from <input type="time"> into minutes-from-midnight. */
export function parseTimeOfDay(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

// Re-export the calc helper phase metadata for ergonomic component imports.
export { PHASE_META } from "./autoStateCalc";
export type { AutoStatePhase } from "./autoStateCalc";

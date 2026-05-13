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
  surprised: "😮",
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
// Stomach decay
// ---------------------------------------------------------------------------

export const STOMACH_DECAY_PER_HOUR = 10;

export function computeEffectiveStomachScore(
  rawScore: number,
  updatedAt: number,
): number {
  const hoursElapsed = (Date.now() - updatedAt) / 3_600_000;
  return Math.max(0, rawScore - hoursElapsed * STOMACH_DECAY_PER_HOUR);
}

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
  showMood: true,
  showEnergy: true,
  showStomach: true,
  showStress: true,
  showSchedulePressure: true,
  showStatusNote: true,
  showBiometrics: false,
};

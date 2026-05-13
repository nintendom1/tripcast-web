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

export const MOOD_VALUES: TravelerMoodValue[] = [
  "hopeful",
  "good",
  "surprised",
  "okay",
  "melancholy",
  "anxious",
  "rough",
  "disappointed",
  "why_did_i_bother",
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

export const SCHEDULE_VALUES: TravelerSchedulePressureLevel[] = [
  "ahead",
  "comfortable",
  "tight",
  "rushed",
  "behind",
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
  if (score <= 112) return "full";
  if (score <= 137) return "stuffed";
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
  if (diffMin < 60) return `${diffMin} min ago`;
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

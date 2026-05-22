// Sheet personality configuration for the Meadow theme.
// Each panel has a distinct accent color, label tag, decorative motif, and
// tinted background — sourced from themes.jsx (meadow.sheets).
// Later PRs apply these to SheetAccentRail, SheetPersonalityTag, and
// per-sheet header backgrounds.

export type SheetKey = "journal" | "missions" | "votes" | "awards" | "state";

export interface SheetPersonality {
  color: string;
  tag: string;
  motif: string;
  bg: string;
}

export const MEADOW_SHEET_PERSONALITIES: Record<SheetKey, SheetPersonality> = {
  journal:  { color: "#ff8b4a", tag: "Diary",   motif: "✿", bg: "#fff0dc" },
  missions: { color: "#6dba4a", tag: "Tasks",   motif: "✦", bg: "#e5f2d6" },
  votes:    { color: "#7a9cdc", tag: "Vote",    motif: "✤", bg: "#dfeafa" },
  awards:   { color: "#ffb84a", tag: "Cabinet", motif: "★", bg: "#fff1d4" },
  state:    { color: "#f06f7e", tag: "Feels",   motif: "♥", bg: "#ffdfe2" },
} as const;

export const SHEET_KEYS = Object.keys(MEADOW_SHEET_PERSONALITIES) as SheetKey[];

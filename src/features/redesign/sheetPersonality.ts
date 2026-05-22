// Sheet personality configuration for the Meadow theme.
// Each panel has a distinct accent color, label tag, decorative motif, and
// tinted background — sourced from themes.jsx (meadow.sheets).
// Later PRs apply these to SheetAccentRail, SheetPersonalityTag, and
// per-sheet header backgrounds.

export type SheetKey = "journal" | "missions" | "votes" | "awards" | "state" | "funds";

export interface SheetPersonality {
  color: string;
  tag: string;
  motif: string;
  bg: string;
}

export const MEADOW_SHEET_PERSONALITIES: Record<SheetKey, SheetPersonality> = {
  journal:  { color: "#6dba4a", tag: "Diary",   motif: "clock", bg: "#e5f2d6" },
  missions: { color: "#ffb84a", tag: "Tasks",   motif: "trophy", bg: "#fff1d4" },
  votes:    { color: "#7a9cdc", tag: "Vote",    motif: "check-square", bg: "#dfeafa" },
  awards:   { color: "#f06f7e", tag: "Cabinet", motif: "medal", bg: "#ffdfe2" },
  state:    { color: "#f06f7e", tag: "Feels",   motif: "♥", bg: "#ffdfe2" },
  funds:    { color: "#6dba4a", tag: "Ledger",  motif: "dollar-sign", bg: "#e5f2d6" },
} as const;

export const SHEET_KEYS = Object.keys(MEADOW_SHEET_PERSONALITIES) as SheetKey[];

// Sheet personality configuration for the Meadow theme.
// Each panel has a distinct accent color, decorative motif, and tinted
// background sourced from tripcast-handoff-repair/project/src/themes.jsx
// (meadow.sheets).

export type SheetKey = "journal" | "missions" | "votes" | "awards" | "state" | "funds";

export interface SheetPersonality {
  color: string;
  motif: string;
  bg: string;
}

export const MEADOW_SHEET_PERSONALITIES: Record<SheetKey, SheetPersonality> = {
  journal:  { color: "#ff8b4a", motif: "clock", bg: "#fff0dc" },
  missions: { color: "#6dba4a", motif: "trophy", bg: "#e5f2d6" },
  votes:    { color: "#7a9cdc", motif: "check-square", bg: "#dfeafa" },
  awards:   { color: "#ffb84a", motif: "medal", bg: "#fff1d4" },
  state:    { color: "#f06f7e", motif: "heart", bg: "#ffdfe2" },
  funds:    { color: "#6dba4a", motif: "dollar-sign", bg: "#e5f2d6" },
} as const;

export const SHEET_KEYS = Object.keys(MEADOW_SHEET_PERSONALITIES) as SheetKey[];

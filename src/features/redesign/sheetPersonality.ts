// Sheet personality configuration for Meadow and Constellation themes.
// Each panel has a distinct accent color, decorative motif, and tinted
// background sourced from tripcast-handoff-repair/project/src/themes.jsx.

import { useTheme } from "../../providers/ThemeProvider";

export type SheetKey = "journal" | "missions" | "votes" | "awards" | "state" | "funds";

export interface SheetPersonality {
  color: string;
  motif: string;
  bg: string;
}

export const MEADOW_SHEET_PERSONALITIES: Record<SheetKey, SheetPersonality> = {
  journal:  { color: "#ff8b4a", motif: "clock",         bg: "#fff0dc" },
  missions: { color: "#6dba4a", motif: "trophy",        bg: "#e5f2d6" },
  votes:    { color: "#7a9cdc", motif: "check-square",  bg: "#dfeafa" },
  awards:   { color: "#ffb84a", motif: "medal",         bg: "#fff1d4" },
  state:    { color: "#f06f7e", motif: "heart",         bg: "#ffdfe2" },
  funds:    { color: "#6dba4a", motif: "dollar-sign",   bg: "#e5f2d6" },
} as const;

export const CONSTELLATION_SHEET_PERSONALITIES: Record<SheetKey, SheetPersonality> = {
  journal:  { color: "#7a9aff", motif: "clock",         bg: "rgba(122,154,255,0.14)" },
  missions: { color: "#ffb24a", motif: "trophy",        bg: "rgba(255,178,74,0.14)"  },
  votes:    { color: "#7ac88a", motif: "check-square",  bg: "rgba(122,200,138,0.14)" },
  awards:   { color: "#ffd86a", motif: "medal",         bg: "rgba(255,216,106,0.14)" },
  state:    { color: "#ff8aae", motif: "heart",         bg: "rgba(255,138,174,0.14)" },
  funds:    { color: "#ffb24a", motif: "dollar-sign",   bg: "rgba(255,178,74,0.14)"  },
} as const;

export const SHEET_KEYS = Object.keys(MEADOW_SHEET_PERSONALITIES) as SheetKey[];

/** Returns the correct sheet personality map for the currently resolved theme. */
export function useSheetPersonalities(): Record<SheetKey, SheetPersonality> {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "constellation"
    ? CONSTELLATION_SHEET_PERSONALITIES
    : MEADOW_SHEET_PERSONALITIES;
}

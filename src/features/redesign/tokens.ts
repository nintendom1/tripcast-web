// Meadow design token values — sourced from tripcast-handoff/project/src/themes.jsx.
// These are the canonical raw values for the Meadow identity.
// CSS custom properties (--meadow-*) in styles.css mirror these values;
// prefer the CSS vars at use sites so dark-mode overrides can layer on top.

export const MEADOW = {
  bg: "#fdf6e3",
  bgMap: "#eaf2da",
  paper: "#fffdf4",
  paperEdge: "#f0e6c8",
  ink: "#3a2e1f",
  inkSoft: "#7a6849",
  inkVery: "#b8a578",
  primary: "#ff8b4a",
  primaryInk: "#ffffff",
  gold: "#ffb84a",
  royal: "#7a9cdc",
  forest: "#6dba4a",
  ruby: "#f06f7e",
  radius: 14,
  radiusLg: 26,
  crest: "✿",
  fontDisplay: '"Fredoka", "M PLUS Rounded 1c", system-ui, sans-serif',
  fontBody: '"Quicksand", "Nunito", system-ui, sans-serif',
  fontMono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

export type MeadowTokens = typeof MEADOW;

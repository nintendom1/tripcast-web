import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#102a43", light: "#243b55" },
        crimson: { DEFAULT: "#d92332" },
        // Meadow design tokens — sourced from themes.jsx (meadow entry).
        meadow: {
          bg: "var(--meadow-bg)",
          paper: "var(--meadow-paper)",
          "paper-edge": "var(--meadow-paper-edge)",
          ink: "var(--meadow-ink)",
          "ink-soft": "var(--meadow-ink-soft)",
          "ink-very": "var(--meadow-ink-very)",
          primary: "var(--meadow-primary)",
          "primary-ink": "var(--meadow-primary-ink)",
          gold: "var(--meadow-gold)",
          royal: "var(--meadow-royal)",
          forest: "var(--meadow-forest)",
          ruby: "var(--meadow-ruby)",
        },
      },
      keyframes: {
        "attention-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "game-toast-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "attention-pulse": "attention-pulse 1.2s ease-in-out infinite",
        "game-toast-in": "game-toast-in 0.4s cubic-bezier(.5,1.4,.4,1.05) forwards",
      },
    },
  },
} satisfies Config;

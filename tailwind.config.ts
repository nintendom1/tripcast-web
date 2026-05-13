import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Existing brand tokens — preserved from styles.css for continuity
        navy: { DEFAULT: "#102a43", light: "#243b55" },
        crimson: { DEFAULT: "#d92332" },
        // Theme slots — intentionally empty; filled during art-pass sprint
        // accent: {},   ← future RPG accent color
        // surface: {},  ← future RPG panel background
      },
      keyframes: {
        // Attention animation for unseen-vote button — behavior, not style
        "attention-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        "attention-pulse": "attention-pulse 1.2s ease-in-out infinite",
      },
    },
  },
} satisfies Config;

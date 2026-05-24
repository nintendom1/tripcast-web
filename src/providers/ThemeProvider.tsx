import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export type ThemeMode = "meadow" | "constellation" | "auto";

interface ThemeContextType {
  mode: ThemeMode;
  resolvedTheme: "meadow" | "constellation";
  resolvedMapBase: "bright" | "fiord";
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEMES = {
  meadow: {
    "--bg-paper": "#fdf6e3",
    "--bg-card": "#fffdf4",
    "--ink-1": "#3a2e1f",
    "--ink-2": "#7a6849",
    "--ink-3": "#b8a578",
    "--flag": "#ff8b4a",
    "--amber": "#ffb84a",
    "--plum": "#f06f7e",
    "--teal": "#7a9cdc",
    "--bg-danger": "#fff1f2", // rose-50
    "--ink-danger": "#450a0a", // rose-950
    "--shadow-sheet": "0 -12px 40px rgba(0,0,0,0.12)",
    "--header-gradient": "linear-gradient(to bottom, var(--bg-paper), transparent)",
    "--ink-on-dark": "#ffffff",
    "--ink-on-brand": "#ffffff",
    "--map-land": "#f4f0dc",
    "--map-water": "#b3def0",
    "--map-park": "#daedba",
    "--map-forest": "#bcd58a",
    "--line-soft": "rgba(0,0,0,0.06)",
    "--meter-track": "rgba(0,0,0,0.05)",
    "--font-display": '"Fredoka", "Quicksand", sans-serif',
    "--radius-sheet": "26px",
  },
  constellation: {
    "--bg-paper": "#1c1f3a",
    "--bg-card": "#2c2f4f",
    "--ink-1": "#f0eaff",
    "--ink-2": "#c2bdee",
    "--ink-3": "#9a95d2", // Bumped for better contrast on dark navy
    "--flag": "#ffb24a",
    "--amber": "#ffd86a",
    "--plum": "#ff8aae",
    "--teal": "#7a9aff",
    "--bg-danger": "rgba(244, 63, 94, 0.2)",
    "--ink-danger": "#ff8aae",
    "--shadow-sheet": "none",
    "--header-gradient": "none", // Removed for Constellation per request
    "--ink-on-dark": "#1c1f3a",
    "--ink-on-brand": "#1c1f3a",
    "--map-land": "#2a2e4a",
    "--map-water": "#1e2440",
    "--map-park": "#324a48",
    "--map-forest": "#3a5256",
    "--line-soft": "rgba(255,255,255,0.1)",
    "--meter-track": "rgba(255,255,255,0.08)",
    "--font-display": '"Fredoka", "Quicksand", sans-serif',
    "--radius-sheet": "18px",
  },
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(
    () => (localStorage.getItem("tripcast.theme_mode") as ThemeMode) || "auto"
  );

  const getResolvedTheme = useCallback((): "meadow" | "constellation" => {
    if (mode !== "auto") return mode;
    const hour = new Date().getHours();
    // Constellation from 8PM (20) to 6AM
    return hour >= 20 || hour < 6 ? "constellation" : "meadow";
  }, [mode]);

  const [resolvedTheme, setResolvedTheme] = useState(getResolvedTheme());

  // Apply CSS Variables to Root
  useEffect(() => {
    const current = getResolvedTheme();
    setResolvedTheme(current);
    
    const root = document.documentElement;
    const mapping = THEMES[current];
    
    Object.entries(mapping).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Add a global class for conditional styling (e.g., .theme-dark)
    if (current === "constellation") {
      root.classList.add("theme-dark");
    } else {
      root.classList.remove("theme-dark");
    }
  }, [getResolvedTheme]);

  // Handle Auto-switch timer
  useEffect(() => {
    if (mode !== "auto") return;
    const interval = setInterval(() => {
      const next = getResolvedTheme();
      if (next !== resolvedTheme) setResolvedTheme(next);
    }, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [mode, resolvedTheme, getResolvedTheme]);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem("tripcast.theme_mode", newMode);
  };

  return (
    <ThemeContext.Provider value={{ mode, resolvedTheme, resolvedMapBase: resolvedTheme === "meadow" ? "bright" : "fiord", setMode }}>
      <style>{`
        /* Seamless Theme Transitions */
        :root {
          transition: background-color 0.6s cubic-bezier(0.4, 0, 0.2, 1),
                      color 0.6s cubic-bezier(0.4, 0, 0.2, 1),
                      border-color 0.6s cubic-bezier(0.4, 0, 0.2, 1),
                      --map-land 0.6s ease,
                      --map-water 0.6s ease,
                      --shadow-sheet 0.6s ease;
        }
        /* Specific transition for sheets and cards */
        [data-role="options-sheet"], .bg-\[var\(--bg-card\)\] {
          transition: background-color 0.6s ease, color 0.6s ease;
        }
        .maplibregl-map {
          background-color: var(--map-land);
          transition: background-color 0.6s ease;
        }
      `}</style>
      {children}
    </ThemeContext.Provider>
  );
}

const FALLBACK_THEME: ThemeContextType = {
  mode: "meadow",
  resolvedTheme: "meadow",
  resolvedMapBase: "bright",
  setMode: () => console.warn("ThemeProvider missing: theme selection will not persist. Ensure <ThemeProvider> wraps the app root."),
};

export function useTheme() {
  const context = useContext(ThemeContext);
  return context ?? FALLBACK_THEME;
}
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";

import {
  tripcastApi,
  type AutoState,
  type AutoStateForFollower,
  type Role,
  type TravelerPreferences,
  type TravelerPreferencesForFollower,
} from "@/convex/tripcastApi";
import {
  getMinuteOfDayInTimeZone,
  getPhaseAtMinute,
} from "@/features/travelstate/autoStateCalc";
import { log as debugLog } from "@/debug/debugLogger";

export type ThemeMode = "meadow" | "constellation" | "auto";

interface ThemeContextType {
  mode: ThemeMode;
  resolvedTheme: "meadow" | "constellation";
  resolvedMapBase: "bright" | "fiord";
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const THEME_TRANSITION_CLASS = "theme-transitioning";
const THEME_TRANSITION_MS = 480;
let themeTransitionTimeout: number | undefined;

const TRAVELER_TZ_CACHE_KEY = "tripcast.theme.last_traveler_timezone";
// Hardcoded fallback window. Used when we have a Traveler tz but no
// explicitly-set theme window (and, for step 1, no autoState bedtime/wake).
// Project default for day/night theme cutover.
const FALLBACK_DAY_START_MINUTES = 6 * 60; // 06:00
const FALLBACK_NIGHT_START_MINUTES = 21 * 60; // 21:00

const THEMES = {
  meadow: {
    "--bg-paper": "#fdf6e3",
    "--bg-paper-2": "#f0e6c8",
    "--bg-card": "#fffdf4",
    "--ink-1": "#3a2e1f",
    "--ink-2": "#7a6849",
    "--ink-3": "#b8a578",
    "--flag": "#ff8b4a",
    "--flag-2": "#b43f1a",
    "--green": "#2f7d4f",
    "--green-2": "#1f5a37",
    "--amber": "#ffb84a",
    "--amber-2": "#b47e1f",
    "--plum": "#f06f7e",
    "--teal": "#7a9cdc",
    "--teal-2": "#1e5c6b",
    "--danger": "#c2392a",
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
    "--background": "#fdf6e3",
    "--foreground": "#3a2e1f",
    "--card": "#fffdf4",
    "--card-foreground": "#3a2e1f",
    "--popover": "#fffdf4",
    "--popover-foreground": "#3a2e1f",
    "--primary": "#3a2e1f",
    "--primary-foreground": "#fffdf4",
    "--secondary": "#fff0dc",
    "--secondary-foreground": "#3a2e1f",
    "--muted": "#f0e6c8",
    "--muted-foreground": "#7a6849",
    "--accent": "#fff0dc",
    "--accent-foreground": "#3a2e1f",
    "--destructive": "#d92332",
    "--destructive-foreground": "#ffffff",
    "--border": "rgba(0,0,0,0.08)",
    "--input": "rgba(0,0,0,0.14)",
    "--ring": "#ff8b4a",
    "--font-display": '"Fredoka", "Quicksand", sans-serif',
    "--radius-sheet": "26px",
  },
  constellation: {
    "--bg-paper": "#1c1f3a",
    "--bg-paper-2": "#242746",
    "--bg-card": "#2c2f4f",
    "--ink-1": "#f0eaff",
    "--ink-2": "#c2bdee",
    "--ink-3": "#9a95d2", // Bumped for better contrast on dark navy
    "--flag": "#ffb24a",
    "--flag-2": "#d99432",
    "--green": "#8be0a4",
    "--green-2": "#5bbf82",
    "--amber": "#ffd86a",
    "--amber-2": "#ffd86a",
    "--plum": "#ff8aae",
    "--teal": "#7a9aff",
    "--teal-2": "#9fb2ff",
    "--danger": "#ff8aae",
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
    "--background": "#1c1f3a",
    "--foreground": "#f0eaff",
    "--card": "#2c2f4f",
    "--card-foreground": "#f0eaff",
    "--popover": "#2c2f4f",
    "--popover-foreground": "#f0eaff",
    "--primary": "#f0eaff",
    "--primary-foreground": "#1c1f3a",
    "--secondary": "#242746",
    "--secondary-foreground": "#f0eaff",
    "--muted": "#242746",
    "--muted-foreground": "#c2bdee",
    "--accent": "#34385a",
    "--accent-foreground": "#f0eaff",
    "--destructive": "#ff8aae",
    "--destructive-foreground": "#1c1f3a",
    "--border": "rgba(255,255,255,0.12)",
    "--input": "rgba(255,255,255,0.18)",
    "--ring": "#7a9aff",
    "--font-display": '"Fredoka", "Quicksand", sans-serif',
    "--radius-sheet": "18px",
  },
};

function applyThemeVariables(theme: "meadow" | "constellation", animate = false) {
  const root = document.documentElement;
  const mapping = THEMES[theme];
  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (animate && !reduceMotion) {
    root.classList.add(THEME_TRANSITION_CLASS);
    window.clearTimeout(themeTransitionTimeout);
  }

  Object.entries(mapping).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  if (theme === "constellation") {
    root.classList.add("theme-dark");
    root.classList.add("dark");
  } else {
    root.classList.remove("theme-dark");
    root.classList.remove("dark");
  }

  if (animate && !reduceMotion) {
    themeTransitionTimeout = window.setTimeout(() => {
      root.classList.remove(THEME_TRANSITION_CLASS);
    }, THEME_TRANSITION_MS);
  }
}

// Snapshot of the Traveler's auto-state + preferences, pushed up from
// <TravelerThemeBridge>. `undefined` means we don't have any query result yet
// (no session, queries loading, or no bridge mounted). Once resolved,
// `autoStateEnabled` distinguishes whether we can compute phase from the
// Traveler's own bedtime/wake window. `preferencesTimeZone` is the Traveler's
// explicit / device-detected tz from travelerPreferences; it lets the theme
// follow the Traveler's tz even when autoState is off (step 1.5 in the chain).
// `themeDayStartMinutes` / `themeNightStartMinutes` are the Traveler's explicit
// day/night cutovers from travelerPreferences. When present, they win over
// autoState bedtime/wake — bedtime models when the Traveler sleeps, which can
// be later than when the world looks "night."
export type TravelerAutoThemeSnapshot =
  | {
      autoStateEnabled: false;
      preferencesTimeZone: string | null;
      themeDayStartMinutes: number | null;
      themeNightStartMinutes: number | null;
    }
  | {
      autoStateEnabled: true;
      autoTimeZone: string;
      autoBedtimeMinutes: number;
      autoWakeTimeMinutes: number;
      preferencesTimeZone: string | null;
      themeDayStartMinutes: number | null;
      themeNightStartMinutes: number | null;
    };

interface ThemeBridgeContextValue {
  setTravelerAutoSnapshot: (snapshot: TravelerAutoThemeSnapshot | undefined) => void;
  setCachedTravelerTimeZone: (timeZone: string) => void;
}

const ThemeBridgeContext = createContext<ThemeBridgeContextValue | undefined>(undefined);

function readCachedTravelerTimeZone(): string | null {
  try {
    const raw = window.localStorage.getItem(TRAVELER_TZ_CACHE_KEY);
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function writeCachedTravelerTimeZone(timeZone: string) {
  try {
    window.localStorage.setItem(TRAVELER_TZ_CACHE_KEY, timeZone);
  } catch {
    // localStorage may be unavailable (private mode, quota). Theme cache is non-critical.
  }
}

type ResolvedAutoTheme = {
  theme: "meadow" | "constellation";
  source: "live-traveler" | "preferences-traveler" | "device-loading" | "cached-traveler" | "device-clock";
  reason: string;
  timeZone: string | null;
  minuteOfDay: number | null;
  bedtimeMinutes: number | null;
  wakeMinutes: number | null;
  phase: "night" | "wake" | "daytime" | null;
};

// Pick the day/night window: explicit theme window wins; otherwise use the
// hardcoded project fallback. Auto State bedtime/wake models sleep, not theme.
function pickThemeWindow(
  themeDay: number | null,
  themeNight: number | null,
): { nightStart: number; dayStart: number; windowSource: "theme" | "fallback" } {
  if (themeDay != null && themeNight != null && themeDay !== themeNight) {
    return { nightStart: themeNight, dayStart: themeDay, windowSource: "theme" };
  }
  return {
    nightStart: FALLBACK_NIGHT_START_MINUTES,
    dayStart: FALLBACK_DAY_START_MINUTES,
    windowSource: "fallback",
  };
}

export function resolveAutoTheme(
  snapshot: TravelerAutoThemeSnapshot | undefined,
  cachedTimeZone: string | null,
  now: number,
  deviceTimeZone: string | null = null,
): ResolvedAutoTheme {
  // Step 1: live Traveler autoState.
  if (snapshot && snapshot.autoStateEnabled) {
    try {
      const minute = getMinuteOfDayInTimeZone(now, snapshot.autoTimeZone);
      const { nightStart, dayStart, windowSource } = pickThemeWindow(
        snapshot.themeDayStartMinutes,
        snapshot.themeNightStartMinutes,
      );
      // getPhaseAtMinute returns "night" / "wake" / "daytime"; the wake band is
      // the first 60 min after dayStart and reads as daytime for theme.
      const phase = getPhaseAtMinute(minute, nightStart, dayStart);
      return {
        theme: phase === "night" ? "constellation" : "meadow",
        source: "live-traveler",
        reason: `snapshot-enabled:window=${windowSource}`,
        timeZone: snapshot.autoTimeZone,
        minuteOfDay: minute,
        bedtimeMinutes: nightStart,
        wakeMinutes: dayStart,
        phase,
      };
    } catch {
      // Invalid timezone — fall through to the next step.
    }
  }

  // Step 1.5: live Traveler preferences timezone. Used when the snapshot is
  // loaded but autoState is disabled — we still know the Traveler's tz, so
  // drive day/night from it.
  if (snapshot && !snapshot.autoStateEnabled && snapshot.preferencesTimeZone) {
    try {
      const tz = snapshot.preferencesTimeZone;
      const minute = getMinuteOfDayInTimeZone(now, tz);
      // No autoState here, so we only consider the theme window or the fallback.
      const { nightStart, dayStart, windowSource } = pickThemeWindow(
        snapshot.themeDayStartMinutes,
        snapshot.themeNightStartMinutes,
      );
      const phase = getPhaseAtMinute(minute, nightStart, dayStart);
      return {
        theme: phase === "night" ? "constellation" : "meadow",
        source: "preferences-traveler",
        reason: `autostate-disabled-using-prefs-tz:window=${windowSource}`,
        timeZone: tz,
        minuteOfDay: minute,
        bedtimeMinutes: nightStart,
        wakeMinutes: dayStart,
        phase,
      };
    } catch {
      // Invalid prefs tz — fall through.
    }
  }

  // Step 2: while the live query is still loading (snapshot === undefined),
  // pick a tz for the loading paint. Prefer the viewer's device tz — it's a
  // far better predictor of "is it dark for them right now" than a cached
  // Traveler tz that may be stale (e.g. a "UTC" entry written before the
  // real prefs landed). Fall back to the cache only if device detection
  // fails (e.g. an unusual browser env without Intl). A resolved-but-disabled
  // snapshot skips this and falls straight to step 3 (or step 1.5 above).
  if (snapshot === undefined) {
    if (deviceTimeZone) {
      try {
        const minute = getMinuteOfDayInTimeZone(now, deviceTimeZone);
        const phase = getPhaseAtMinute(
          minute,
          FALLBACK_NIGHT_START_MINUTES,
          FALLBACK_DAY_START_MINUTES,
        );
        return {
          theme: phase === "night" ? "constellation" : "meadow",
          source: "device-loading",
          reason: "snapshot-loading-using-device-tz",
          timeZone: deviceTimeZone,
          minuteOfDay: minute,
          bedtimeMinutes: FALLBACK_NIGHT_START_MINUTES,
          wakeMinutes: FALLBACK_DAY_START_MINUTES,
          phase,
        };
      } catch {
        // Device tz unusable — fall through to the cache.
      }
    }
    if (cachedTimeZone) {
      try {
        const minute = getMinuteOfDayInTimeZone(now, cachedTimeZone);
        const phase = getPhaseAtMinute(
          minute,
          FALLBACK_NIGHT_START_MINUTES,
          FALLBACK_DAY_START_MINUTES,
        );
        return {
          theme: phase === "night" ? "constellation" : "meadow",
          source: "cached-traveler",
          reason: "snapshot-loading-using-cached-tz",
          timeZone: cachedTimeZone,
          minuteOfDay: minute,
          bedtimeMinutes: FALLBACK_NIGHT_START_MINUTES,
          wakeMinutes: FALLBACK_DAY_START_MINUTES,
          phase,
        };
      } catch {
        // Cached timezone no longer valid — fall through.
      }
    }
  }

  // Step 3: viewer device clock — same fallback window as everywhere else.
  const date = new Date(now);
  const minute = date.getHours() * 60 + date.getMinutes();
  const isNight = minute >= FALLBACK_NIGHT_START_MINUTES || minute < FALLBACK_DAY_START_MINUTES;

  const reason =
    snapshot === undefined
      ? cachedTimeZone
        ? "tz-resolution-failed"
        : "no-snapshot-no-cache"
      : snapshot.autoStateEnabled
        ? "live-tz-resolution-failed"
        : snapshot.preferencesTimeZone
          ? "prefs-tz-resolution-failed"
          : "snapshot-disabled-no-prefs-tz";
  return {
    theme: isNight ? "constellation" : "meadow",
    source: "device-clock",
    reason,
    timeZone: null,
    minuteOfDay: null,
    bedtimeMinutes: null,
    wakeMinutes: null,
    phase: null,
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const hasAppliedThemeRef = useRef(false);
  const [mode, setModeState] = useState<ThemeMode>(
    () => (localStorage.getItem("tripcast.theme_mode") as ThemeMode) || "auto"
  );
  const [travelerAutoSnapshot, setTravelerAutoSnapshot] =
    useState<TravelerAutoThemeSnapshot | undefined>(undefined);
  const [cachedTimeZone, setCachedTimeZoneState] = useState<string | null>(
    () => readCachedTravelerTimeZone(),
  );
  const [now, setNow] = useState(() => Date.now());

  // Phase boundaries depend on `now`, so a 1-minute tick is required regardless
  // of source. Manual modes don't need it.
  useEffect(() => {
    if (mode !== "auto") return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, [mode]);

  const resolution = useMemo<ResolvedAutoTheme>(() => {
    if (mode !== "auto") {
      return {
        theme: mode,
        source: "device-clock",
        reason: "manual-mode",
        timeZone: null,
        minuteOfDay: null,
        bedtimeMinutes: null,
        wakeMinutes: null,
        phase: null,
      };
    }
    const deviceTimeZone = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
      } catch {
        return null;
      }
    })();
    return resolveAutoTheme(travelerAutoSnapshot, cachedTimeZone, now, deviceTimeZone);
  }, [mode, travelerAutoSnapshot, cachedTimeZone, now]);

  const resolvedTheme = resolution.theme;

  // Apply on resolvedTheme change OR explicit mode change. The mode dep covers
  // the case where the user picks a manual theme that already matches the
  // current resolved theme — we still want the transition animation to play.
  useEffect(() => {
    applyThemeVariables(resolvedTheme, hasAppliedThemeRef.current);
    hasAppliedThemeRef.current = true;
  }, [resolvedTheme, mode]);

  // Surface which arm of the resolution chain fired and what inputs it saw.
  // Helps diagnose Traveler vs viewer timezone when both are the same machine.
  useEffect(() => {
    if (mode !== "auto") {
      debugLog("info", "ThemeProvider", "theme:resolved", "ui", {
        mode,
        resolvedTheme,
        source: "manual-mode",
      });
      return;
    }
    debugLog("info", "ThemeProvider", "theme:resolved", "ui", {
      mode,
      resolvedTheme,
      source: resolution.source,
      reason: resolution.reason,
      timeZone: resolution.timeZone,
      minuteOfDay: resolution.minuteOfDay,
      bedtimeMinutes: resolution.bedtimeMinutes,
      wakeMinutes: resolution.wakeMinutes,
      phase: resolution.phase,
      snapshot:
        travelerAutoSnapshot === undefined
          ? "loading"
          : travelerAutoSnapshot.autoStateEnabled
            ? {
                enabled: true,
                tz: travelerAutoSnapshot.autoTimeZone,
                prefsTz: travelerAutoSnapshot.preferencesTimeZone,
              }
            : { enabled: false, prefsTz: travelerAutoSnapshot.preferencesTimeZone },
      cachedTimeZone,
      deviceTimeZone: (() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
        } catch {
          return null;
        }
      })(),
      deviceHour: new Date(now).getHours(),
    });
  }, [
    mode,
    resolvedTheme,
    resolution.source,
    resolution.reason,
    resolution.timeZone,
    resolution.minuteOfDay,
    resolution.bedtimeMinutes,
    resolution.wakeMinutes,
    resolution.phase,
    travelerAutoSnapshot,
    cachedTimeZone,
    now,
  ]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem("tripcast.theme_mode", newMode);
  }, []);

  const setCachedTravelerTimeZone = useCallback((timeZone: string) => {
    setCachedTimeZoneState((prev) => (prev === timeZone ? prev : timeZone));
  }, []);

  const themeValue = useMemo<ThemeContextType>(
    () => ({
      mode,
      resolvedTheme,
      resolvedMapBase: resolvedTheme === "meadow" ? "bright" : "fiord",
      setMode,
    }),
    [mode, resolvedTheme, setMode],
  );

  const bridgeValue = useMemo<ThemeBridgeContextValue>(
    () => ({
      setTravelerAutoSnapshot,
      setCachedTravelerTimeZone,
    }),
    [setCachedTravelerTimeZone],
  );

  return (
    <ThemeContext.Provider value={themeValue}>
      <ThemeBridgeContext.Provider value={bridgeValue}>
        {children}
      </ThemeBridgeContext.Provider>
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

type PrefsThemeSnapshot = {
  timeZone: string | null;
  themeDayStartMinutes: number | null;
  themeNightStartMinutes: number | null;
};

const EMPTY_PREFS_SNAPSHOT: PrefsThemeSnapshot = {
  timeZone: null,
  themeDayStartMinutes: null,
  themeNightStartMinutes: null,
};

function numOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractTravelerPrefsSnapshot(
  prefs: TravelerPreferences | null | undefined,
): PrefsThemeSnapshot {
  if (!prefs) return EMPTY_PREFS_SNAPSHOT;
  return {
    timeZone:
      typeof prefs.travelerTimeZone === "string" && prefs.travelerTimeZone.length > 0
        ? prefs.travelerTimeZone
        : null,
    themeDayStartMinutes: numOrNull(prefs.themeDayStartMinutes),
    themeNightStartMinutes: numOrNull(prefs.themeNightStartMinutes),
  };
}

function extractFollowerPrefsSnapshot(
  prefs: TravelerPreferencesForFollower | null | undefined,
): PrefsThemeSnapshot {
  if (!prefs || !("visible" in prefs) || !prefs.visible) return EMPTY_PREFS_SNAPSHOT;
  return {
    timeZone:
      typeof prefs.travelerTimeZone === "string" && prefs.travelerTimeZone.length > 0
        ? prefs.travelerTimeZone
        : null,
    themeDayStartMinutes: numOrNull(prefs.themeDayStartMinutes),
    themeNightStartMinutes: numOrNull(prefs.themeNightStartMinutes),
  };
}

function buildSnapshot(
  auto: AutoState | AutoStateForFollower | null | undefined,
  prefs: PrefsThemeSnapshot,
  isFollower: boolean,
): { snapshot: TravelerAutoThemeSnapshot; timeZone: string | null } | null {
  if (auto === undefined) return null;

  const base = {
    preferencesTimeZone: prefs.timeZone,
    themeDayStartMinutes: prefs.themeDayStartMinutes,
    themeNightStartMinutes: prefs.themeNightStartMinutes,
  };

  // No row, or follower-invisible row → disabled snapshot, still carrying prefs.
  if (auto === null) {
    return {
      snapshot: { autoStateEnabled: false, ...base },
      timeZone: prefs.timeZone,
    };
  }
  if (isFollower && "visible" in auto && !auto.visible) {
    return {
      snapshot: { autoStateEnabled: false, ...base },
      timeZone: prefs.timeZone,
    };
  }

  // Past this point: traveler row, or visible follower row. Both expose
  // autoStateEnabled + autoTimeZone + bedtime/wake when enabled.
  const settings = auto as AutoState;
  const tz =
    typeof settings.autoTimeZone === "string" && settings.autoTimeZone.length > 0
      ? settings.autoTimeZone
      : null;

  if (settings.autoStateEnabled && tz) {
    return {
      snapshot: {
        autoStateEnabled: true,
        autoTimeZone: tz,
        autoBedtimeMinutes: settings.autoBedtimeMinutes,
        autoWakeTimeMinutes: settings.autoWakeTimeMinutes,
        ...base,
      },
      timeZone: tz ?? prefs.timeZone,
    };
  }

  return {
    snapshot: { autoStateEnabled: false, ...base },
    timeZone: tz ?? prefs.timeZone,
  };
}

/**
 * Mounted inside the authenticated tree once `session` and `role` are known.
 * Subscribes to the role-appropriate Convex auto-state query and pushes a
 * normalized snapshot up to <ThemeProvider> via context. Also persists any
 * valid `autoTimeZone` to localStorage so cold starts can keep the theme stable
 * before the query resolves.
 */
export function TravelerThemeBridge({ token, role }: { token: string; role: Role }) {
  const bridge = useContext(ThemeBridgeContext);

  const travelerAutoState = useQuery(
    tripcastApi.travelerAutoState.travelerGetAutoState,
    role === "traveler" ? { token } : "skip",
  );
  const followerAutoState = useQuery(
    tripcastApi.travelerAutoState.followerGetAutoState,
    role === "follower" ? { token } : "skip",
  );
  const travelerPreferences = useQuery(
    tripcastApi.travelerPreferences.travelerGetPreferences,
    role === "traveler" ? { token } : "skip",
  );
  const followerPreferences = useQuery(
    tripcastApi.travelerPreferences.followerGetPreferences,
    role === "follower" ? { token } : "skip",
  );

  useEffect(() => {
    if (!bridge) return;
    const prefs =
      role === "traveler"
        ? extractTravelerPrefsSnapshot(travelerPreferences)
        : extractFollowerPrefsSnapshot(followerPreferences);
    const auto = role === "traveler" ? travelerAutoState : followerAutoState;
    const normalized = buildSnapshot(auto, prefs, role === "follower");
    if (normalized === null) {
      debugLog("info", "TravelerThemeBridge", "autostate:loading", "ui", { role });
      return; // query still loading; keep prior snapshot
    }
    debugLog("info", "TravelerThemeBridge", "autostate:pushed", "ui", {
      role,
      enabled: normalized.snapshot.autoStateEnabled,
      timeZone: normalized.timeZone,
      preferencesTimeZone: prefs.timeZone,
      themeDayStartMinutes: prefs.themeDayStartMinutes,
      themeNightStartMinutes: prefs.themeNightStartMinutes,
      bedtimeMinutes: normalized.snapshot.autoStateEnabled
        ? normalized.snapshot.autoBedtimeMinutes
        : null,
      wakeMinutes: normalized.snapshot.autoStateEnabled
        ? normalized.snapshot.autoWakeTimeMinutes
        : null,
    });
    bridge.setTravelerAutoSnapshot(normalized.snapshot);
    if (normalized.timeZone) {
      writeCachedTravelerTimeZone(normalized.timeZone);
      bridge.setCachedTravelerTimeZone(normalized.timeZone);
    }
  }, [
    bridge,
    role,
    travelerAutoState,
    followerAutoState,
    travelerPreferences,
    followerPreferences,
  ]);

  useEffect(() => {
    return () => {
      bridge?.setTravelerAutoSnapshot(undefined);
    };
  }, [bridge]);

  return null;
}

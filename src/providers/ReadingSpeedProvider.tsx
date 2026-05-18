import * as React from "react";

export type ReadingSpeed = "instant" | "fast" | "normal" | "slow";

const SPEED_MS: Record<ReadingSpeed, number> = {
  instant: 0,
  fast: 8,
  normal: 16,
  slow: 30,
};

const STORAGE_KEY = "tripcast.story.readingSpeed";

function isReadingSpeed(value: string | null): value is ReadingSpeed {
  return value === "instant" || value === "fast" || value === "normal" || value === "slow";
}

function readStoredSpeed(fallback: ReadingSpeed): ReadingSpeed {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isReadingSpeed(raw)) return raw;
  } catch {
    // localStorage may be unavailable; fall through
  }
  return fallback;
}

function writeStoredSpeed(value: ReadingSpeed) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Non-critical; ignore quota / private-mode errors
  }
}

export interface ReadingSpeedContextValue {
  speed: ReadingSpeed;
  setSpeed: (next: ReadingSpeed) => void;
  /** Milliseconds per character for the current speed. `0` means render the full text immediately. */
  speedMs: number;
}

const ReadingSpeedContext = React.createContext<ReadingSpeedContextValue | null>(null);

export interface ReadingSpeedProviderProps {
  children: React.ReactNode;
  defaultSpeed?: ReadingSpeed;
}

export function ReadingSpeedProvider({
  children,
  defaultSpeed = "normal",
}: ReadingSpeedProviderProps) {
  const [speed, setSpeedState] = React.useState<ReadingSpeed>(() => readStoredSpeed(defaultSpeed));

  const setSpeed = React.useCallback((next: ReadingSpeed) => {
    setSpeedState(next);
    writeStoredSpeed(next);
  }, []);

  const value = React.useMemo<ReadingSpeedContextValue>(
    () => ({ speed, setSpeed, speedMs: SPEED_MS[speed] }),
    [speed, setSpeed],
  );

  return (
    <ReadingSpeedContext.Provider value={value}>{children}</ReadingSpeedContext.Provider>
  );
}

export function useReadingSpeed(): ReadingSpeedContextValue {
  const ctx = React.useContext(ReadingSpeedContext);
  if (ctx === null) {
    throw new Error("useReadingSpeed must be used inside <ReadingSpeedProvider>");
  }
  return ctx;
}

/**
 * Safe variant for components that may render outside the provider (e.g. unit tests
 * that don't wrap their subject). Returns "normal" with the matching ms value.
 */
export function useReadingSpeedSafe(): ReadingSpeedContextValue {
  const ctx = React.useContext(ReadingSpeedContext);
  if (ctx) return ctx;
  return { speed: "normal", setSpeed: () => undefined, speedMs: SPEED_MS.normal };
}

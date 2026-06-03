import * as React from "react";

export type ClassificationState = "stopped" | "walking" | "moving";
export type ThresholdKind = "walking" | "moving";

export type TriggeredRecord = {
  timestamp: number;
  from: ClassificationState | null;
  to: ClassificationState;
  speedMps: number;
};

export type AlmostRecord = {
  timestamp: number;
  speedMps: number;
  thresholdMps: number;
};

type PersistedShape = {
  isCalibrationModeEnabled: boolean;
  lastTriggeredWalking: TriggeredRecord | null;
  lastTriggeredMoving: TriggeredRecord | null;
  lastAlmostTriggeredWalking: AlmostRecord | null;
  lastAlmostTriggeredMoving: AlmostRecord | null;
};

const STORAGE_KEY = "tripcast:movementDebug";

const EMPTY: PersistedShape = {
  isCalibrationModeEnabled: false,
  lastTriggeredWalking: null,
  lastTriggeredMoving: null,
  lastAlmostTriggeredWalking: null,
  lastAlmostTriggeredMoving: null,
};

function readPersisted(): PersistedShape {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    return {
      isCalibrationModeEnabled: !!parsed.isCalibrationModeEnabled,
      lastTriggeredWalking: parsed.lastTriggeredWalking ?? null,
      lastTriggeredMoving: parsed.lastTriggeredMoving ?? null,
      lastAlmostTriggeredWalking: parsed.lastAlmostTriggeredWalking ?? null,
      lastAlmostTriggeredMoving: parsed.lastAlmostTriggeredMoving ?? null,
    };
  } catch {
    return EMPTY;
  }
}

function writePersisted(value: PersistedShape) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota / private-mode errors
  }
}

export interface MovementDebugRecordsContextValue {
  isCalibrationModeEnabled: boolean;
  lastTriggeredWalking: TriggeredRecord | null;
  lastTriggeredMoving: TriggeredRecord | null;
  lastAlmostTriggeredWalking: AlmostRecord | null;
  lastAlmostTriggeredMoving: AlmostRecord | null;
  setCalibrationEnabled: (next: boolean) => void;
  recordTriggered: (input: { from: ClassificationState | null; to: ClassificationState; speedMps: number }) => void;
  recordAlmostTriggered: (input: { thresholdType: ThresholdKind; speedMps: number; thresholdMps: number }) => void;
}

export type RecentFix = {
  at: number;
  speedMps: number | null;
};

export interface MovementDebugSpeedContextValue {
  currentSpeedMps: number | null;
  lastFixAt: number | null;
  recentFixes: RecentFix[];
  recordCurrentSpeed: (mps: number | null) => void;
  clearRecentFixes: () => void;
}

const RECENT_FIXES_CAP = 10;

const RecordsContext = React.createContext<MovementDebugRecordsContextValue | null>(null);
const SpeedContext = React.createContext<MovementDebugSpeedContextValue | null>(null);

export interface MovementDebugProviderProps {
  children: React.ReactNode;
}

export function MovementDebugProvider({ children }: MovementDebugProviderProps) {
  const [persisted, setPersisted] = React.useState<PersistedShape>(() => readPersisted());
  const [currentSpeedMps, setCurrentSpeedMps] = React.useState<number | null>(null);
  const [lastFixAt, setLastFixAt] = React.useState<number | null>(null);
  const [recentFixes, setRecentFixes] = React.useState<RecentFix[]>([]);

  // Keep latest persisted snapshot in a ref so setters can compose without
  // stale-closure issues when called from a high-frequency GPS handler.
  const persistedRef = React.useRef(persisted);
  React.useEffect(() => {
    persistedRef.current = persisted;
  }, [persisted]);

  const update = React.useCallback((patch: Partial<PersistedShape>) => {
    const next = { ...persistedRef.current, ...patch };
    persistedRef.current = next;
    setPersisted(next);
    writePersisted(next);
  }, []);

  const setCalibrationEnabled = React.useCallback(
    (next: boolean) => {
      update({ isCalibrationModeEnabled: next });
      if (!next) {
        setCurrentSpeedMps(null);
        setLastFixAt(null);
        setRecentFixes([]);
      }
    },
    [update],
  );

  const recordTriggered = React.useCallback<
    MovementDebugRecordsContextValue["recordTriggered"]
  >(
    ({ from, to, speedMps }) => {
      const record: TriggeredRecord = { timestamp: Date.now(), from, to, speedMps };
      if (to === "walking") update({ lastTriggeredWalking: record });
      else if (to === "moving") update({ lastTriggeredMoving: record });
    },
    [update],
  );

  const recordAlmostTriggered = React.useCallback<
    MovementDebugRecordsContextValue["recordAlmostTriggered"]
  >(
    ({ thresholdType, speedMps, thresholdMps }) => {
      const record: AlmostRecord = { timestamp: Date.now(), speedMps, thresholdMps };
      if (thresholdType === "walking") update({ lastAlmostTriggeredWalking: record });
      else update({ lastAlmostTriggeredMoving: record });
    },
    [update],
  );

  const recordCurrentSpeed = React.useCallback((mps: number | null) => {
    const at = Date.now();
    setCurrentSpeedMps(mps);
    setLastFixAt(at);
    setRecentFixes((prev) => {
      const next = [...prev, { at, speedMps: mps }];
      if (next.length > RECENT_FIXES_CAP) next.splice(0, next.length - RECENT_FIXES_CAP);
      return next;
    });
  }, []);

  const clearRecentFixes = React.useCallback(() => {
    setRecentFixes([]);
  }, []);

  const recordsValue = React.useMemo<MovementDebugRecordsContextValue>(
    () => ({
      isCalibrationModeEnabled: persisted.isCalibrationModeEnabled,
      lastTriggeredWalking: persisted.lastTriggeredWalking,
      lastTriggeredMoving: persisted.lastTriggeredMoving,
      lastAlmostTriggeredWalking: persisted.lastAlmostTriggeredWalking,
      lastAlmostTriggeredMoving: persisted.lastAlmostTriggeredMoving,
      setCalibrationEnabled,
      recordTriggered,
      recordAlmostTriggered,
    }),
    [persisted, setCalibrationEnabled, recordTriggered, recordAlmostTriggered],
  );

  const speedValue = React.useMemo<MovementDebugSpeedContextValue>(
    () => ({ currentSpeedMps, lastFixAt, recentFixes, recordCurrentSpeed, clearRecentFixes }),
    [currentSpeedMps, lastFixAt, recentFixes, recordCurrentSpeed, clearRecentFixes],
  );

  return (
    <RecordsContext.Provider value={recordsValue}>
      <SpeedContext.Provider value={speedValue}>{children}</SpeedContext.Provider>
    </RecordsContext.Provider>
  );
}

const FALLBACK_RECORDS: MovementDebugRecordsContextValue = {
  isCalibrationModeEnabled: false,
  lastTriggeredWalking: null,
  lastTriggeredMoving: null,
  lastAlmostTriggeredWalking: null,
  lastAlmostTriggeredMoving: null,
  setCalibrationEnabled: () => undefined,
  recordTriggered: () => undefined,
  recordAlmostTriggered: () => undefined,
};

const FALLBACK_SPEED: MovementDebugSpeedContextValue = {
  currentSpeedMps: null,
  lastFixAt: null,
  recentFixes: [],
  recordCurrentSpeed: () => undefined,
  clearRecentFixes: () => undefined,
};

export function useMovementDebugRecords(): MovementDebugRecordsContextValue {
  return React.useContext(RecordsContext) ?? FALLBACK_RECORDS;
}

export function useMovementDebugSpeed(): MovementDebugSpeedContextValue {
  return React.useContext(SpeedContext) ?? FALLBACK_SPEED;
}

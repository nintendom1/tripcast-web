import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useDebugLogger } from "../../debug/useDebugLogger";
import {
  DEFAULT_MOVING_MPS,
  DEFAULT_WALKING_MPS,
  mpsToKmh,
  mpsToMph,
} from "../../lib/movementUnits";
import { cn } from "../../lib/utils";
import {
  startCalibrationLocationWatch,
  type CalibrationFix,
} from "../../native/calibrationWatcher";
import {
  useMovementDebugRecords,
  useMovementDebugSpeed,
  type AlmostRecord,
  type RecentFix,
  type TriggeredRecord,
} from "../../providers/MovementDebugProvider";
import { tripcastApi } from "../../convex/tripcastApi";
import { useQuery } from "convex/react";

import { formatRelativeTime } from "./travelerStateUtils";

function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6_371_000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dlat = toRad(b.lat - a.lat);
  const dlon = toRad(b.lon - a.lon);
  const hav =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dlon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
}

const PANEL_MOTION = {
  initial: { y: "100%" },
  animate: { y: 0 },
  exit: { y: "100%" },
  transition: { duration: 0.34, ease: [0.22, 0.9, 0.3, 1.05] as const },
};

type SpeedUnit = "mph" | "kmh" | "mps";

const UNIT_LABEL: Record<SpeedUnit, string> = {
  mph: "mph",
  kmh: "km/h",
  mps: "m/s",
};

function convert(mps: number, unit: SpeedUnit): number {
  if (unit === "mph") return mpsToMph(mps);
  if (unit === "kmh") return mpsToKmh(mps);
  return mps;
}

function formatSpeed(mps: number | null | undefined, unit: SpeedUnit): string {
  if (mps == null) return "—";
  return convert(mps, unit).toFixed(2);
}

function formatStatePair(from: TriggeredRecord["from"], to: TriggeredRecord["to"]): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return `${from ? cap(from) : "—"} → ${cap(to)}`;
}

function TriggeredRow({
  label,
  record,
  unit,
}: {
  label: string;
  record: TriggeredRecord | null;
  unit: SpeedUnit;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
        {label}
      </span>
      {record ? (
        <span className="text-sm text-[var(--ink-1)]">
          {formatRelativeTime(record.timestamp)} · {formatStatePair(record.from, record.to)} @{" "}
          {formatSpeed(record.speedMps, unit)} {UNIT_LABEL[unit]}
        </span>
      ) : (
        <span className="text-sm text-[var(--ink-3)]">No transitions recorded yet.</span>
      )}
    </div>
  );
}

function AlmostRow({
  label,
  record,
  unit,
}: {
  label: string;
  record: AlmostRecord | null;
  unit: SpeedUnit;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
        {label}
      </span>
      {record ? (
        <span className="text-sm text-[var(--ink-1)]">
          {formatRelativeTime(record.timestamp)} · {formatSpeed(record.speedMps, unit)}{" "}
          {UNIT_LABEL[unit]} (threshold {formatSpeed(record.thresholdMps, unit)} {UNIT_LABEL[unit]})
        </span>
      ) : (
        <span className="text-sm text-[var(--ink-3)]">No near-misses recorded yet.</span>
      )}
    </div>
  );
}

function RecentFixesPanel({
  fixes,
  unit,
  now,
}: {
  fixes: RecentFix[];
  unit: SpeedUnit;
  now: number;
}) {
  return (
    <div className="grid gap-1.5 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
        Recent fixes (last {fixes.length || 0})
      </span>
      {fixes.length === 0 ? (
        <span className="text-xs text-[var(--ink-3)]">No fixes yet this session.</span>
      ) : (
        <ul className="grid gap-0.5">
          {[...fixes].reverse().map((fix) => {
            const secs = Math.max(0, Math.floor((now - fix.at) / 1000));
            return (
              <li
                key={fix.at}
                className="flex items-baseline justify-between gap-2 text-xs tabular-nums text-[var(--ink-2)]"
              >
                <span className="text-[var(--ink-3)]">{secs}s ago</span>
                <span>
                  {formatSpeed(fix.speedMps, unit)} {UNIT_LABEL[unit]}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export interface MovementDebugModalProps {
  token: string;
  onClose: () => void;
}

export default function MovementDebugModal({ token, onClose }: MovementDebugModalProps) {
  const log = useDebugLogger("MovementDebugModal", "src/features/travelstate/MovementDebugModal.tsx");
  const records = useMovementDebugRecords();
  const { currentSpeedMps, lastFixAt, recentFixes, recordCurrentSpeed } = useMovementDebugSpeed();

  const movementPrefs = useQuery(
    tripcastApi.travelerPreferences.travelerGetPreferences,
    token ? { token } : "skip",
  );

  const [unit, setUnit] = useState<SpeedUnit>("mph");

  useEffect(() => {
    log.logUi("init", {
      isCalibrationModeEnabled: records.isCalibrationModeEnabled,
    });
    // Mount-only intentionally; subsequent toggle changes are logged separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const walkingMps = movementPrefs?.movementWalkingThresholdMps ?? DEFAULT_WALKING_MPS;
  const movingMps = movementPrefs?.movementMovingThresholdMps ?? DEFAULT_MOVING_MPS;

  // 1s tick keeps "Last fix Xs ago" and the recent-fixes ages live while the
  // modal is open. Cheap (one setState/sec).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1_000);
    return () => window.clearInterval(id);
  }, []);

  // Calibration watcher: foreground-only, distanceFilter:0. The everyday
  // watcher in TripMap uses a 50m filter to save battery — far too coarse for
  // calibration. We start a second, high-frequency watcher only while the
  // modal is open AND calibration is on, so battery cost is bounded.
  const recordRef = useRef(recordCurrentSpeed);
  recordRef.current = recordCurrentSpeed;
  const logRef = useRef(log);
  logRef.current = log;
  useEffect(() => {
    if (!records.isCalibrationModeEnabled) return;
    logRef.current.logUi("calibration:watch:start", {});
    let prev: { lat: number; lon: number; at: number } | null = null;
    const stop = startCalibrationLocationWatch(
      (fix: CalibrationFix) => {
        let speedMps: number | null = typeof fix.speed === "number" ? fix.speed : null;
        if (speedMps === null && prev) {
          const dtSec = (fix.at - prev.at) / 1000;
          if (dtSec > 0 && dtSec < 60) {
            speedMps = haversineMeters(prev, fix) / dtSec;
          }
        }
        prev = { lat: fix.lat, lon: fix.lon, at: fix.at };
        recordRef.current(speedMps);
      },
      (error) => {
        logRef.current.error("calibration:watch:error", "state", {
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      logRef.current.logUi("calibration:watch:stop", {});
      stop();
    };
  }, [records.isCalibrationModeEnabled]);

  const fixAgeLabel = useMemo(() => {
    if (!records.isCalibrationModeEnabled) return null;
    if (lastFixAt === null) return "Waiting for first GPS fix…";
    const secs = Math.max(0, Math.floor((Date.now() - lastFixAt) / 1000));
    if (secs < 1) return "Last fix just now";
    return `Last fix ${secs}s ago`;
    // tick drives the re-evaluation each second.
  }, [lastFixAt, records.isCalibrationModeEnabled, tick]);

  const speedDisplay = useMemo(() => {
    if (!records.isCalibrationModeEnabled) return "—";
    return formatSpeed(currentSpeedMps, unit);
  }, [currentSpeedMps, records.isCalibrationModeEnabled, unit]);

  return (
    <motion.div
      {...PANEL_MOTION}
      data-role="movement-debug-modal"
      className="absolute inset-x-0 bottom-0 z-[20] flex max-h-[85dvh] flex-col rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-none items-center justify-between border-b border-[var(--line-soft)] px-4 py-3">
        <h2 className="font-[var(--font-display)] text-lg font-extrabold tracking-tight text-[var(--ink-1)]">
          Calibration & Debug
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Calibration & Debug"
          className="rounded-full p-1.5 text-[var(--ink-3)] hover:bg-[var(--bg-card)] hover:text-[var(--ink-1)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid gap-4 p-4">
          {/* Calibration toggle */}
          <label className="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2.5 text-[var(--ink-1)]">
            <span className="flex flex-col">
              <span className="text-sm font-medium">Enable Calibration Mode</span>
              <span className="text-xs text-[var(--ink-3)]">Shows live GPS speed while open.</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={records.isCalibrationModeEnabled}
              aria-label="Enable Calibration Mode"
              onClick={() => {
                const next = !records.isCalibrationModeEnabled;
                log.logInteraction("calibration:toggle", { next });
                records.setCalibrationEnabled(next);
              }}
              className={cn(
                "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                records.isCalibrationModeEnabled
                  ? "bg-[var(--flag)]"
                  : "bg-[var(--meter-track)]",
              )}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-[var(--bg-card)] shadow transition-transform ${
                  records.isCalibrationModeEnabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>

          {/* Live speedometer */}
          <div className="grid gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                Live speed
              </span>
              <div className="flex gap-1">
                {(["mph", "kmh", "mps"] as SpeedUnit[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => {
                      log.logInteraction("unit:change", { from: unit, to: u });
                      setUnit(u);
                    }}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                      unit === u
                        ? "bg-[var(--ink-1)] text-[var(--ink-on-dark)]"
                        : "bg-[var(--meter-track)] text-[var(--ink-3)]",
                    )}
                  >
                    {UNIT_LABEL[u]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-[var(--font-display)] text-5xl font-extrabold tabular-nums tracking-tight text-[var(--ink-1)]">
                {speedDisplay}
              </span>
              <span className="text-sm text-[var(--ink-3)]">{UNIT_LABEL[unit]}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full bg-[var(--meter-track)] px-2 py-0.5 text-[10px] text-[var(--ink-2)]">
                Walking ≥ {formatSpeed(walkingMps, unit)} {UNIT_LABEL[unit]}
              </span>
              <span className="rounded-full bg-[var(--meter-track)] px-2 py-0.5 text-[10px] text-[var(--ink-2)]">
                Moving ≥ {formatSpeed(movingMps, unit)} {UNIT_LABEL[unit]}
              </span>
            </div>
            {fixAgeLabel && (
              <span className="text-[11px] text-[var(--ink-3)]">{fixAgeLabel}</span>
            )}
          </div>

          {/* Recent fixes (only meaningful while calibration is on) */}
          {records.isCalibrationModeEnabled && (
            <RecentFixesPanel fixes={recentFixes} unit={unit} now={Date.now()} />
          )}

          {/* Records */}
          <div className="grid gap-2">
            <TriggeredRow
              label="Last triggered · Walking"
              record={records.lastTriggeredWalking}
              unit={unit}
            />
            <AlmostRow
              label="Last almost · Walking"
              record={records.lastAlmostTriggeredWalking}
              unit={unit}
            />
            <TriggeredRow
              label="Last triggered · Moving"
              record={records.lastTriggeredMoving}
              unit={unit}
            />
            <AlmostRow
              label="Last almost · Moving"
              record={records.lastAlmostTriggeredMoving}
              unit={unit}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

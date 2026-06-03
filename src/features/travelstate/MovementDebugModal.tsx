import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useDebugLogger } from "../../debug/useDebugLogger";
import {
  DEFAULT_MOVING_MPS,
  DEFAULT_WALKING_MPS,
  mpsToKmh,
  mpsToMph,
} from "../../lib/movementUnits";
import { cn } from "../../lib/utils";
import {
  useMovementDebugRecords,
  useMovementDebugSpeed,
  type AlmostRecord,
  type TriggeredRecord,
} from "../../providers/MovementDebugProvider";
import { tripcastApi } from "../../convex/tripcastApi";
import { useQuery } from "convex/react";

import { formatRelativeTime } from "./travelerStateUtils";

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

export interface MovementDebugModalProps {
  token: string;
  onClose: () => void;
}

export default function MovementDebugModal({ token, onClose }: MovementDebugModalProps) {
  const log = useDebugLogger("MovementDebugModal", "src/features/travelstate/MovementDebugModal.tsx");
  const records = useMovementDebugRecords();
  const { currentSpeedMps } = useMovementDebugSpeed();

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

  // Refresh relative times even when no data changes, so "2m ago" ticks.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

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
          </div>

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

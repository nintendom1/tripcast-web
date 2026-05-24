import { useCallback, useState, useEffect, useRef, type ReactNode } from "react";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Heart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSheetPersonalities } from "../redesign/sheetPersonality";

import { tripcastApi } from "../../convex/tripcastApi";
import type {
  AutoState,
  TravelerMoodValue,
  TravelerEnergyLevel,
  TravelerStomachLevel,
  TravelerStressLevel,
  TravelerSchedulePressureLevel,
} from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import {
  MOOD_LABELS,
  MOOD_VALUES,
  ENERGY_LABELS,
  ENERGY_VALUES,
  STOMACH_LABELS,
  STOMACH_VALUES,
  STRESS_LABELS,
  STRESS_VALUES,
  SCHEDULE_LABELS,
  SCHEDULE_VALUES,
  getStateEmoji,
  formatRelativeTime,
  DEFAULT_VISIBILITY,
  ENERGY_SCORE_FOR_LEVEL,
  getEnergyLevelFromScore,
  STRESS_SCORE_FOR_LEVEL,
  getStressLevelFromScore,
  STOMACH_SCORE_FOR_LEVEL,
  getStomachLevelFromScore,
} from "./travelerStateUtils";
import { formatSaveError } from "./formatSaveError";
import AutoStateTab, { type AutoStateFooterAction } from "./AutoStateTab";
import { computeAutoState } from "./autoStateCalc";
import { TERMS } from "../../copy/terminology";
import { useActiveUiContext } from "../../debug/useActiveUiContext";

type TravelerStateSheetProps = {
  token: string;
  onClose: () => void;
  onToast?: (msg: string) => void;
  debugSource?: { source: string; sourceLabel: string };
};

type TabView = "state" | "visibility" | "auto";

const BODY_FOOTER_CLEARANCE_CLASS = "pb-28";
const FOOTER_DOCK_CLEARANCE_CLASS = "pb-[calc(var(--dock-h,76px)+16px+env(safe-area-inset-bottom))]";
const stateInputClass =
  "rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] text-[var(--ink-1)] outline-none focus:border-[var(--flag)] focus:ring-1 focus:ring-[var(--flag)]";
const stateLabelClass = "text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]";
const stateHintClass = "text-xs text-[var(--ink-3)]";

// Matches the shared bottom-sheet curve in components/ui/sheet.tsx and the
// redesign reference (tripcast-handoff-repair): a 0.34s slide with a slight
// overshoot so the State panel opens/closes like every other sheet.
const PANEL_MOTION = {
  initial: { y: "100%" },
  animate: { y: 0 },
  exit: { y: "100%" },
  transition: { duration: 0.34, ease: [0.22, 0.9, 0.3, 1.05] as const },
};

function computeCurrentAutoScores(autoState: AutoState | null | undefined) {
  if (!autoState?.autoStateEnabled || autoState.autoEnabledAt == null) return null;
  const hasEnergy = typeof autoState.autoBaseEnergyScore === "number";
  const hasStomach = typeof autoState.autoBaseStomachScore === "number";
  if (!hasEnergy && !hasStomach) return null;

  const estimate = computeAutoState({
    autoTimeZone: autoState.autoTimeZone,
    autoBedtimeMinutes: autoState.autoBedtimeMinutes,
    autoWakeTimeMinutes: autoState.autoWakeTimeMinutes,
    autoEnergyMin: autoState.autoEnergyMin,
    autoEnergyMax: autoState.autoEnergyMax,
    autoStomachMin: autoState.autoStomachMin,
    autoStomachMax: autoState.autoStomachMax,
    autoEnergySleepDeltaPerTick: autoState.autoEnergySleepDeltaPerTick,
    autoEnergyAwakeDeltaPerTick: autoState.autoEnergyAwakeDeltaPerTick,
    autoStomachAwakeDeltaPerTick: autoState.autoStomachAwakeDeltaPerTick,
    autoStomachNightAboveHungryEveryTicks: autoState.autoStomachNightAboveHungryEveryTicks,
    autoStomachNightAtOrBelowHungryEveryTicks: autoState.autoStomachNightAtOrBelowHungryEveryTicks,
    baseEnergy: autoState.autoBaseEnergyScore ?? 50,
    baseStomach: autoState.autoBaseStomachScore ?? 50,
    autoEnabledAt: autoState.autoEnabledAt,
    targetTime: Date.now(),
  });

  return {
    energyScore: hasEnergy ? estimate.estimatedEnergy : undefined,
    stomachScore: hasStomach ? estimate.estimatedStomach : undefined,
  };
}

function ChipRow<T extends string>({
  values,
  labels,
  selected,
  onSelect,
  onDeselect,
}: {
  values: T[];
  labels: Record<T, string>;
  selected: T | undefined;
  onSelect: (v: T) => void;
  onDeselect?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => (selected === v ? onDeselect?.() : onSelect(v))}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            selected === v
              ? "bg-[var(--flag)] text-[var(--ink-on-brand)]"
              : "bg-[var(--meter-track)] text-[var(--ink-2)] hover:bg-[var(--bg-card)] hover:text-[var(--ink-1)]",
          )}
        >
          {labels[v]}
        </button>
      ))}
    </div>
  );
}

function ScoreSlider({
  value,
  onChange,
  min,
  max,
  label,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  min: number;
  max: number;
  label: string;
}) {
  const display = value ?? Math.round((min + max) / 2);
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        value={display}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
        style={{ accentColor: "var(--flag)" }}
      />
      <span className="w-7 text-right text-xs text-[var(--ink-3)]">{display}</span>
      <span className="text-xs text-[var(--ink-3)]">{label}</span>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  placeholder,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min: number;
  max: number;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "" ? undefined : Number(raw));
      }}
      className={cn("h-8 w-20 px-2 text-sm", stateInputClass)}
      placeholder={placeholder ?? "—"}
    />
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2.5 text-[var(--ink-1)]">
      <span className="text-sm font-medium">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
          checked ? "bg-[var(--flag)]" : "bg-[var(--meter-track)]",
        )}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-[var(--bg-card)] shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

/** Grouped "segment" of the State form — a titled card that reduces density by
 *  visually separating the bars, the chip pickers, notes, and biometrics. */
function StateSegment({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 shadow-[var(--shadow-card)]">
      <div className="flex items-baseline justify-between">
        <h3 className="font-[var(--meadow-font-display)] text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--ink-2)]">
          {title}
        </h3>
        {hint && <span className="text-[10px] text-[var(--ink-3)]">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function SheetSaveFooter({
  error,
  savedAt,
  showSavedAt,
  children,
}: {
  error: string | null;
  savedAt: number | null;
  showSavedAt: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-role="traveler-state-sheet-footer"
      className={cn(
        "flex-none border-t border-[var(--line-soft)] bg-[var(--bg-paper)] px-4 pt-4 shadow-[0_-8px_20px_rgba(15,23,42,0.06)]",
        FOOTER_DOCK_CLEARANCE_CLASS,
      )}
    >
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-md border border-[var(--ink-danger)] bg-[var(--bg-danger)] px-3 py-2 text-sm text-[var(--ink-danger)]"
        >
          {error}
        </p>
      )}
      {savedAt && showSavedAt && !error && (
        <p className="mb-3 text-sm text-[var(--teal)]" suppressHydrationWarning>
          Saved {formatRelativeTime(savedAt)}
        </p>
      )}
      {children}
    </div>
  );
}

export default function TravelerStateSheet({ token, onClose, onToast, debugSource }: TravelerStateSheetProps) {
  const result = useQuery(tripcastApi.travelerState.travelerGetState, { token });
  const autoState = useQuery(tripcastApi.travelerAutoState.travelerGetAutoState, { token });
  const updateState = useMutation(tripcastApi.travelerState.travelerUpdateState);
  const updateVisibility = useMutation(tripcastApi.travelerState.travelerUpdateStateVisibility);

  const { state: statePersonality } = useSheetPersonalities();
  const log = useDebugLogger("TravelerStateSheet", "src/features/travelstate/TravelerStateSheet.tsx");
  const hasPopulatedRef = useRef(false);
  const [tab, setTab] = useState<TabView>("state");
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [autoFooterAction, setAutoFooterAction] = useState<AutoStateFooterAction | null>(null);
  // State form (no moodScore or scheduleScore — chip-only for those)
  const [stateAt, setStateAt] = useState<string>("");
  const [moodValue, setMoodValue] = useState<TravelerMoodValue | undefined>();
  const [energyLevel, setEnergyLevel] = useState<TravelerEnergyLevel | undefined>();
  const [energyScore, setEnergyScore] = useState<number | undefined>();
  const [stomachLevel, setStomachLevel] = useState<TravelerStomachLevel | undefined>();
  const [stomachScore, setStomachScore] = useState<number | undefined>();
  const [stressLevel, setStressLevel] = useState<TravelerStressLevel | undefined>();
  const [stressScore, setStressScore] = useState<number | undefined>();
  const [scheduleLevel, setScheduleLevel] = useState<TravelerSchedulePressureLevel | undefined>();
  const [statusNote, setStatusNote] = useState("");
  const [statusEmoji, setStatusEmoji] = useState("");
  const [biometricsOpen, setBiometricsOpen] = useState(false);
  const [steps, setSteps] = useState<number | undefined>();
  const [avgHr, setAvgHr] = useState<number | undefined>();
  const [restHr, setRestHr] = useState<number | undefined>();
  const [sleepHours, setSleepHours] = useState<number | undefined>();
  const [activeMin, setActiveMin] = useState<number | undefined>();
  const [biometricNote, setBiometricNote] = useState("");

  // Visibility form
  const [showTravelerState, setShowTravelerState] = useState(DEFAULT_VISIBILITY.showTravelerState);
  const [showTravelerClock, setShowTravelerClock] = useState(DEFAULT_VISIBILITY.showTravelerClock);
  const [showMood, setShowMood] = useState(DEFAULT_VISIBILITY.showMood);
  const [showEnergy, setShowEnergy] = useState(DEFAULT_VISIBILITY.showEnergy);
  const [showStomach, setShowStomach] = useState(DEFAULT_VISIBILITY.showStomach);
  const [showStress, setShowStress] = useState(DEFAULT_VISIBILITY.showStress);
  const [showSchedulePressure, setShowSchedulePressure] = useState(DEFAULT_VISIBILITY.showSchedulePressure);
  const [showStatusNote, setShowStatusNote] = useState(DEFAULT_VISIBILITY.showStatusNote);
  const [showBiometrics, setShowBiometrics] = useState(DEFAULT_VISIBILITY.showBiometrics);
  useActiveUiContext(true, {
    sheetName: "TravelerStateSheet",
    label: TERMS.travelerState,
    view: reviewing && tab === "state" ? "state-review" : tab,
    source: debugSource?.source ?? "unknown",
    sourceLabel: debugSource?.sourceLabel ?? "Unknown",
    file: "src/features/travelstate/TravelerStateSheet.tsx",
  }, { boundsSelector: "[data-role='traveler-state-sheet']" });

  useEffect(() => {
    log.logUi("sheet:open", { tab: "state" });
    return () => log.logUi("sheet:close", { trigger: "unmount" });
  }, [log]);

  // Rendered-dimensions instrumentation (transient surface): measure the sheet
  // after commit so layout/size bugs are visible on devices we can't see.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-role='traveler-state-sheet']");
    if (!el) return;
    const rect = el.getBoundingClientRect();
    log.logUi("state:rendered", {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      viewport: { w: window.innerWidth, h: window.innerHeight },
    });
  }, [log]);

  // Log a "segment" (bar) value change with from/to for device debugging.
  function logBarChange(bar: "energy" | "stomach" | "calm", from: number | undefined, to: number) {
    log.logUi("state:segment:change", { bar, from, to });
  }

  // Populate form once from loaded data
  useEffect(() => {
    if (!result || autoState === undefined || hasPopulatedRef.current) return;
    hasPopulatedRef.current = true;
    const { state, visibility } = result;
    const currentAutoScores = computeCurrentAutoScores(autoState);
    if (state) {
      const currentEnergyScore =
        currentAutoScores?.energyScore ??
        state.energyScore ??
        (state.energyLevel ? ENERGY_SCORE_FOR_LEVEL[state.energyLevel] : undefined);
      const currentStomachScore =
        currentAutoScores?.stomachScore ??
        state.stomachScore ??
        (state.stomachLevel ? STOMACH_SCORE_FOR_LEVEL[state.stomachLevel] : undefined);

      setMoodValue(state.moodValue);
      setEnergyLevel(currentEnergyScore !== undefined ? getEnergyLevelFromScore(currentEnergyScore) : state.energyLevel);
      setEnergyScore(currentEnergyScore);
      setStomachLevel(currentStomachScore !== undefined ? getStomachLevelFromScore(currentStomachScore) : state.stomachLevel);
      setStomachScore(currentStomachScore);
      setStressLevel(state.stressLevel);
      setStressScore(
        state.stressScore ?? (state.stressLevel ? STRESS_SCORE_FOR_LEVEL[state.stressLevel] : undefined),
      );
      setScheduleLevel(state.schedulePressureLevel);
      setStatusNote(state.statusNote ?? "");
      setStatusEmoji(state.statusEmoji ?? "");
      setSteps(state.biometricSteps);
      setAvgHr(state.biometricAverageHeartRate);
      setRestHr(state.biometricRestingHeartRate);
      setSleepHours(state.biometricSleepHours);
      setActiveMin(state.biometricActiveMinutes);
      setBiometricNote(state.biometricNote ?? "");
    } else if (currentAutoScores) {
      setEnergyLevel(
        currentAutoScores.energyScore !== undefined ? getEnergyLevelFromScore(currentAutoScores.energyScore) : undefined,
      );
      setEnergyScore(currentAutoScores.energyScore);
      setStomachLevel(
        currentAutoScores.stomachScore !== undefined ? getStomachLevelFromScore(currentAutoScores.stomachScore) : undefined,
      );
      setStomachScore(currentAutoScores.stomachScore);
    }
    if (visibility && visibility.updatedAt !== null) {
      setShowTravelerState(visibility.showTravelerState);
      setShowTravelerClock(visibility.showTravelerClock ?? DEFAULT_VISIBILITY.showTravelerClock);
      setShowMood(visibility.showMood);
      setShowEnergy(visibility.showEnergy);
      setShowStomach(visibility.showStomach);
      setShowStress(visibility.showStress);
      setShowSchedulePressure(visibility.showSchedulePressure);
      setShowStatusNote(visibility.showStatusNote);
      setShowBiometrics(visibility.showBiometrics);
    }
  }, [result, autoState]);

  function toIsoLocal(ts: number) {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function getStateAtMs(): number {
    if (stateAt) {
      const parsed = new Date(stateAt).getTime();
      if (!isNaN(parsed)) return parsed;
    }
    return Date.now();
  }

  function handleClearAll() {
    setMoodValue(undefined);
    setEnergyLevel(undefined);
    setEnergyScore(undefined);
    setStomachLevel(undefined);
    setStomachScore(undefined);
    setStressLevel(undefined);
    setStressScore(undefined);
    setScheduleLevel(undefined);
    setStatusNote("");
    setStatusEmoji("");
    setStateAt("");
    setError(null);
    setSavedAt(null);
  }

  function handleReviewState() {
    setError(null);
    setReviewing(true);
    log.logUi("state:review:open", {
      mood: moodValue,
      energy: energyScore,
      stomach: stomachScore,
      calm: stressScore,
    });
  }

  async function handleConfirmSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    log.logInteraction("state:submit", { mood: moodValue, energy: energyLevel, stress: stressLevel });
    try {
      await updateState({
        token,
        stateAt: getStateAtMs(),
        moodValue,
        energyLevel,
        energyScore,
        stomachLevel,
        stomachScore,
        stressLevel,
        stressScore,
        schedulePressureLevel: scheduleLevel,
        statusNote: statusNote || undefined,
        statusEmoji: statusEmoji || undefined,
        biometricSteps: steps,
        biometricAverageHeartRate: avgHr,
        biometricRestingHeartRate: restHr,
        biometricSleepHours: sleepHours,
        biometricActiveMinutes: activeMin,
        biometricNote: biometricNote || undefined,
        biometricSource: steps !== undefined || avgHr !== undefined ? "manual" : undefined,
      });
      log.logInteraction("submit:success", { action: "updateState" });
      onClose();
    } catch (e) {
      log.error("submit:error", "mutation", { message: e instanceof Error ? e.message : String(e) });
      setError(formatSaveError(e));
      setReviewing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveVisibility() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateVisibility({
        token,
        showTravelerState,
        showTravelerClock,
        showMood,
        showEnergy,
        showStomach,
        showStress,
        showSchedulePressure,
        showStatusNote,
        showBiometrics,
      });
      onToast?.("Visibility saved.");
      onClose();
    } catch (e) {
      setError(formatSaveError(e));
    } finally {
      setSaving(false);
    }
  }

  const handleAutoFooterActionChange = useCallback((action: AutoStateFooterAction | null) => {
    setAutoFooterAction(action);
  }, []);

  const stateEmoji = getStateEmoji({ moodValue });
  const lastUpdated = result?.state?.updatedAt;
  const footerError = tab === "auto" ? autoFooterAction?.error ?? null : error;

  return (
    <motion.div
      {...PANEL_MOTION}
      data-role="traveler-state-sheet"
      className="absolute inset-x-0 bottom-0 z-[10] flex max-h-[90dvh] flex-col rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
    >
      {/* Color accent rail */}
      <div
        aria-hidden="true"
        className="absolute left-0 right-0 top-0 h-1 rounded-t-[var(--radius-sheet)]"
        style={{ background: statePersonality.color }}
      />

      {/* Header */}
      <div
        className="flex flex-none items-start justify-between border-b border-[var(--line-soft)] px-4 pb-3 pt-2"
        style={{ background: `linear-gradient(180deg, ${statePersonality.bg} 0%, var(--bg-paper) 100%)` }}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--ink-on-brand)] shadow-sm"
            style={{ background: statePersonality.color }}
          >
            <Heart className="h-4 w-4" />
          </span>
          <div className="flex flex-col">
            <h2 className="font-[var(--font-display)] text-xl font-extrabold tracking-tight text-[var(--ink-1)]">
              How are you?
            </h2>
            {lastUpdated && (
              <span className="text-[11px] text-[var(--ink-3)]" suppressHydrationWarning>
                {stateEmoji} {formatRelativeTime(lastUpdated)}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Traveler State"
          className="rounded-full p-1.5 text-[var(--ink-3)] hover:bg-[var(--bg-card)] hover:text-[var(--ink-1)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex flex-none gap-1 border-b border-[var(--line-soft)] px-4 py-2">
        {(["state", "visibility", "auto"] as TabView[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              log.logInteraction("tab:change", { from: tab, to: t });
              setTab(t);
              setError(null);
            }}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors",
              tab === t
                ? "bg-[var(--ink-1)] text-[var(--ink-on-dark)]"
                : "bg-[var(--bg-card)] text-[var(--ink-3)]",
            )}
          >
            <span className="inline-flex items-center gap-1">
              {t === "state" ? TERMS.state : t === "visibility" ? "Visibility" : TERMS.autoState}
              {t === "auto" && autoState?.autoStateEnabled ? (
                <span
                  className="rounded-full px-1.5 py-px text-[8px] font-bold uppercase tracking-wider"
                  style={{
                    background: `color-mix(in oklab, ${statePersonality.color} 20%, transparent)`,
                    color: statePersonality.color,
                  }}
                >
                  AUTO
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>

      {/* Scrollable body */}
      <div
        data-role="traveler-state-sheet-body"
        className={cn("flex-1 overflow-y-auto", BODY_FOOTER_CLEARANCE_CLASS)}
      >
        {reviewing && tab === "state" && (() => {
          const prev = result?.state ?? null;
          const prevAt = prev?.updatedAt ?? null;

          function fmtLevel(label: string, score: number | undefined) {
            return score !== undefined ? `${label} (${Math.round(score)})` : label;
          }
          function fmtNum(n: number | undefined) {
            return n !== undefined ? String(n) : undefined;
          }
          function fmtText(s: string) {
            if (!s) return undefined;
            return s.length > 50 ? `"${s.slice(0, 50)}…"` : `"${s}"`;
          }

          type DiffEntry = { label: string; from: string | undefined; to: string | undefined };
          const rows: DiffEntry[] = [];
          function add(label: string, from: string | undefined, to: string | undefined) {
            if ((from ?? "") !== (to ?? "")) rows.push({ label, from, to });
          }

          add("Mood",
            prev?.moodValue ? MOOD_LABELS[prev.moodValue] : undefined,
            moodValue ? MOOD_LABELS[moodValue] : undefined,
          );
          add("Energy",
            prev?.energyLevel ? fmtLevel(ENERGY_LABELS[prev.energyLevel], prev.energyScore) : undefined,
            energyLevel ? fmtLevel(ENERGY_LABELS[energyLevel], energyScore) : undefined,
          );
          add("Stomach",
            prev?.stomachLevel ? fmtLevel(STOMACH_LABELS[prev.stomachLevel], prev.stomachScore) : undefined,
            stomachLevel ? fmtLevel(STOMACH_LABELS[stomachLevel], stomachScore) : undefined,
          );
          add("Stress",
            prev?.stressLevel ? fmtLevel(STRESS_LABELS[prev.stressLevel], prev.stressScore) : undefined,
            stressLevel ? fmtLevel(STRESS_LABELS[stressLevel], stressScore) : undefined,
          );
          add("Schedule",
            prev?.schedulePressureLevel ? SCHEDULE_LABELS[prev.schedulePressureLevel] : undefined,
            scheduleLevel ? SCHEDULE_LABELS[scheduleLevel] : undefined,
          );
          add("Note", fmtText(prev?.statusNote ?? ""), fmtText(statusNote));
          add("Emoji", prev?.statusEmoji || undefined, statusEmoji || undefined);
          add("Steps", fmtNum(prev?.biometricSteps), fmtNum(steps));
          add("Avg HR", fmtNum(prev?.biometricAverageHeartRate), fmtNum(avgHr));
          add("Resting HR", fmtNum(prev?.biometricRestingHeartRate), fmtNum(restHr));
          add("Sleep", fmtNum(prev?.biometricSleepHours), fmtNum(sleepHours));
          add("Active min", fmtNum(prev?.biometricActiveMinutes), fmtNum(activeMin));
          add("Bio note", fmtText(prev?.biometricNote ?? ""), fmtText(biometricNote));

          return (
            <div className="grid gap-4 p-4">
              <p className="text-xs text-[var(--ink-3)]" suppressHydrationWarning>
                {prevAt ? `Last entry: ${formatRelativeTime(prevAt)}` : "No previous entry"}
              </p>
              {rows.length === 0 ? (
                <p className="text-sm text-[var(--ink-3)]">No changes from last entry.</p>
              ) : (
                <div className="grid gap-3">
                  {rows.map(({ label, from, to }) => (
                    <div key={label} className="grid gap-0.5">
                      <span className={stateLabelClass}>
                        {label}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm">
                        <span className={from ? "text-[var(--ink-3)] line-through" : "text-[var(--ink-3)]"}>
                          {from ?? "—"}
                        </span>
                        <span className="text-[var(--ink-3)]">→</span>
                        <span className={to ? "font-medium text-[var(--ink-1)]" : "text-[var(--ink-3)]"}>
                          {to ?? "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {!reviewing && tab === "state" && (
          <div className="grid gap-4 p-4">
            {autoState?.autoStateEnabled && (
              <p className="rounded-md border border-[var(--line-soft)] bg-[var(--meter-track)] px-3 py-2 text-xs text-[var(--ink-2)]">
                Energy and Stomach are being auto-estimated in the HUD. Edits here will re-anchor the Auto base.
              </p>
            )}

            {/* Segment 1 — the three bars come first (#5, #6) */}
            <StateSegment title="Energy · Stomach · Calm" hint="how you're running">
              {/* Energy */}
              <div className="grid gap-1.5">
                <label className={stateLabelClass}>
                  Energy
                </label>
                <ChipRow
                  values={ENERGY_VALUES}
                  labels={ENERGY_LABELS}
                  selected={energyLevel}
                  onSelect={(v) => {
                    setEnergyLevel(v);
                    setEnergyScore(ENERGY_SCORE_FOR_LEVEL[v]);
                  }}
                  onDeselect={() => { setEnergyLevel(undefined); setEnergyScore(undefined); }}
                />
                <ScoreSlider
                  value={energyScore}
                  min={0}
                  max={100}
                  label="/ 100"
                  onChange={(n) => {
                    logBarChange("energy", energyScore, n);
                    setEnergyScore(n);
                    setEnergyLevel(getEnergyLevelFromScore(n));
                  }}
                />
              </div>

              {/* Stomach */}
              <div className="grid gap-1.5">
                <label className={stateLabelClass}>
                  Stomach
                </label>
                <ChipRow
                  values={STOMACH_VALUES}
                  labels={STOMACH_LABELS}
                  selected={stomachLevel}
                  onSelect={(v) => {
                    setStomachLevel(v);
                    setStomachScore(STOMACH_SCORE_FOR_LEVEL[v]);
                  }}
                  onDeselect={() => { setStomachLevel(undefined); setStomachScore(undefined); }}
                />
                <ScoreSlider
                  value={stomachScore}
                  min={0}
                  max={150}
                  label="/ 150"
                  onChange={(n) => {
                    logBarChange("stomach", stomachScore, n);
                    setStomachScore(n);
                    setStomachLevel(getStomachLevelFromScore(n));
                  }}
                />
              </div>

              {/* Calm — the stress axis runs Calm → Overwhelmed */}
              <div className="grid gap-1.5">
                <label className={stateLabelClass}>
                  Calm
                </label>
                <ChipRow
                  values={STRESS_VALUES}
                  labels={STRESS_LABELS}
                  selected={stressLevel}
                  onSelect={(v) => {
                    setStressLevel(v);
                    setStressScore(STRESS_SCORE_FOR_LEVEL[v]);
                  }}
                  onDeselect={() => { setStressLevel(undefined); setStressScore(undefined); }}
                />
                <ScoreSlider
                  value={stressScore}
                  min={0}
                  max={100}
                  label="/ 100"
                  onChange={(n) => {
                    logBarChange("calm", stressScore, n);
                    setStressScore(n);
                    setStressLevel(getStressLevelFromScore(n));
                  }}
                />
              </div>
            </StateSegment>

            {/* Mood — chip only (#4) */}
            <div className="grid gap-1.5">
              <label className={stateLabelClass}>
                Mood
              </label>
              <ChipRow
                values={MOOD_VALUES}
                labels={MOOD_LABELS}
                selected={moodValue}
                onSelect={setMoodValue}
                onDeselect={() => setMoodValue(undefined)}
              />
            </div>

            {/* When */}
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <label className={stateLabelClass}>
                  When
                </label>
                <button
                  type="button"
                  onClick={() => setStateAt("")}
                  className="text-xs font-semibold text-[var(--flag)] hover:underline"
                >
                  Now
                </button>
              </div>
              <input
                type="datetime-local"
                value={stateAt || toIsoLocal(Date.now())}
                onChange={(e) => setStateAt(e.target.value)}
                className={cn("h-9 px-3 text-sm", stateInputClass)}
              />
            </div>

            {/* Schedule — chip only (#4) */}
            <div className="grid gap-1.5">
              <label className={stateLabelClass}>
                Schedule
              </label>
              <ChipRow
                values={SCHEDULE_VALUES}
                labels={SCHEDULE_LABELS}
                selected={scheduleLevel}
                onSelect={setScheduleLevel}
                onDeselect={() => setScheduleLevel(undefined)}
              />
            </div>

            {/* Status note */}
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <label className={stateLabelClass}>
                  Status Note
                </label>
                <span className={stateHintClass}>{statusNote.length}/240</span>
              </div>
              <textarea
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value.slice(0, 240))}
                rows={2}
                placeholder="How are you doing? (optional)"
                className={cn("resize-none px-3 py-2 text-sm placeholder:text-[var(--ink-3)]", stateInputClass)}
              />
            </div>

            {/* Status emoji */}
            <div className="grid gap-1.5">
              <label className={stateLabelClass}>
                Status Emoji
              </label>
              <input
                type="text"
                value={statusEmoji}
                onChange={(e) => setStatusEmoji(e.target.value.slice(0, 10))}
                maxLength={10}
                placeholder="e.g. 🏔️"
                className={cn("h-9 w-28 px-3 text-sm placeholder:text-[var(--ink-3)]", stateInputClass)}
              />
            </div>

            {/* Biometrics */}
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => setBiometricsOpen((p) => !p)}
                className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)] hover:text-[var(--ink-1)]"
              >
                <span>{biometricsOpen ? "▾" : "▸"}</span>
                Biometrics
              </button>
              {biometricsOpen && (
                <div className="grid gap-3 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] p-3">
                  {[
                    { label: "Steps", value: steps, setter: setSteps, min: 0, max: 999999 },
                    { label: "Avg HR (bpm)", value: avgHr, setter: setAvgHr, min: 20, max: 240 },
                    { label: "Resting HR (bpm)", value: restHr, setter: setRestHr, min: 20, max: 200 },
                    { label: "Sleep (hrs)", value: sleepHours, setter: setSleepHours, min: 0, max: 24 },
                    { label: "Active min", value: activeMin, setter: setActiveMin, min: 0, max: 1440 },
                  ].map(({ label, value, setter, min, max }) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <span className="text-sm">{label}</span>
                      <NumberInput value={value} onChange={setter} min={min} max={max} />
                    </div>
                  ))}
                  <div className="grid gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Note</span>
                      <span className={stateHintClass}>{biometricNote.length}/240</span>
                    </div>
                    <textarea
                      value={biometricNote}
                      onChange={(e) => setBiometricNote(e.target.value.slice(0, 240))}
                      rows={2}
                      placeholder="e.g. Worn Fitbit all day"
                      className={cn("resize-none px-3 py-2 text-sm placeholder:text-[var(--ink-3)]", stateInputClass)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "auto" && (
          <AutoStateTab
            token={token}
            onToast={onToast}
            onFooterActionChange={handleAutoFooterActionChange}
          />
        )}

        {tab === "visibility" && (
          <div className="grid gap-3 p-4">
            <p className="text-sm text-[var(--ink-2)]">Control what Followers can see.</p>

            <ToggleRow label="Show Traveler State" checked={showTravelerState} onChange={setShowTravelerState} />

            <div className="grid gap-2 pl-2">
              {[
                { label: "Mood", checked: showMood, setter: setShowMood },
                { label: "Clock", checked: showTravelerClock, setter: setShowTravelerClock },
                { label: "Energy", checked: showEnergy, setter: setShowEnergy },
                { label: "Stomach", checked: showStomach, setter: setShowStomach },
                { label: "Stress", checked: showStress, setter: setShowStress },
                { label: "Schedule", checked: showSchedulePressure, setter: setShowSchedulePressure },
                { label: "Status Note", checked: showStatusNote, setter: setShowStatusNote },
                { label: "Biometrics", checked: showBiometrics, setter: setShowBiometrics },
              ].map(({ label, checked, setter }) => (
                <ToggleRow key={label} label={label} checked={checked} onChange={setter} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pinned footer (#7) */}
      <SheetSaveFooter error={footerError} savedAt={savedAt} showSavedAt={tab === "state"}>
        {reviewing && tab === "state" ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setReviewing(false)}
              className="flex-none"
            >
              Back
            </Button>
            <Button onClick={handleConfirmSave} disabled={saving} className="flex-1">
              {saving ? "Saving…" : "Confirm"}
            </Button>
          </div>
        ) : tab === "state" ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={handleClearAll}
              className="flex-none"
            >
              Clear All
            </Button>
            <Button onClick={handleReviewState} className="flex-1">
              Save State
            </Button>
          </div>
        ) : tab === "visibility" ? (
          <Button onClick={handleSaveVisibility} disabled={saving} className="w-full">
            {saving ? "Saving…" : "Save Visibility"}
          </Button>
        ) : tab === "auto" ? (
          <Button
            type="button"
            onClick={() => autoFooterAction?.onSave()}
            disabled={!autoFooterAction || autoFooterAction.saving}
            className="w-full"
          >
            {autoFooterAction?.saving ? "Saving…" : "Save Auto settings"}
          </Button>
        ) : null}
      </SheetSaveFooter>
    </motion.div>
  );
}

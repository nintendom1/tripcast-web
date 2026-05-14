import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import type {
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

type TravelerStateSheetProps = {
  token: string;
  onClose: () => void;
  onToast?: (msg: string) => void;
};

type TabView = "state" | "visibility";

const PANEL_MOTION = {
  initial: { y: "100%" },
  animate: { y: 0 },
  exit: { y: "100%" },
  transition: { duration: 0.22, ease: "easeOut" as const },
};

function formatSaveError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.toLowerCase().includes("too many") || msg.toLowerCase().includes("rate")) {
    return "Too many updates. Try again in a minute.";
  }
  if (msg.toLowerCase().includes("traveler")) {
    return "Traveler access is required.";
  }
  return "Failed to save. Please try again.";
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
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            selected === v
              ? "bg-navy text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
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
        className="flex-1 accent-navy"
      />
      <span className="w-7 text-right text-xs text-muted-foreground">{display}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
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
      className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm"
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
    <label className="flex cursor-pointer items-center justify-between rounded-md border bg-background px-3 py-2.5">
      <span className="text-sm font-medium">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? "bg-navy" : "bg-muted"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

export default function TravelerStateSheet({ token, onClose, onToast }: TravelerStateSheetProps) {
  const result = useQuery(tripcastApi.travelerState.travelerGetState, { token });
  const updateState = useMutation(tripcastApi.travelerState.travelerUpdateState);
  const updateVisibility = useMutation(tripcastApi.travelerState.travelerUpdateStateVisibility);

  const hasPopulatedRef = useRef(false);
  const [tab, setTab] = useState<TabView>("state");
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
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
  const [showMood, setShowMood] = useState(DEFAULT_VISIBILITY.showMood);
  const [showEnergy, setShowEnergy] = useState(DEFAULT_VISIBILITY.showEnergy);
  const [showStomach, setShowStomach] = useState(DEFAULT_VISIBILITY.showStomach);
  const [showStress, setShowStress] = useState(DEFAULT_VISIBILITY.showStress);
  const [showSchedulePressure, setShowSchedulePressure] = useState(DEFAULT_VISIBILITY.showSchedulePressure);
  const [showStatusNote, setShowStatusNote] = useState(DEFAULT_VISIBILITY.showStatusNote);
  const [showBiometrics, setShowBiometrics] = useState(DEFAULT_VISIBILITY.showBiometrics);

  // Populate form once from loaded data
  useEffect(() => {
    if (!result || hasPopulatedRef.current) return;
    hasPopulatedRef.current = true;
    const { state, visibility } = result;
    if (state) {
      setMoodValue(state.moodValue);
      setEnergyLevel(state.energyLevel);
      setEnergyScore(
        state.energyScore ?? (state.energyLevel ? ENERGY_SCORE_FOR_LEVEL[state.energyLevel] : undefined),
      );
      setStomachLevel(state.stomachLevel);
      setStomachScore(
        state.stomachScore ?? (state.stomachLevel ? STOMACH_SCORE_FOR_LEVEL[state.stomachLevel] : undefined),
      );
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
    }
    if (visibility && visibility.updatedAt !== null) {
      setShowTravelerState(visibility.showTravelerState);
      setShowMood(visibility.showMood);
      setShowEnergy(visibility.showEnergy);
      setShowStomach(visibility.showStomach);
      setShowStress(visibility.showStress);
      setShowSchedulePressure(visibility.showSchedulePressure);
      setShowStatusNote(visibility.showStatusNote);
      setShowBiometrics(visibility.showBiometrics);
    }
  }, [result]);

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
  }

  async function handleConfirmSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
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
      onClose();
    } catch (e) {
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

  const stateEmoji = getStateEmoji({ moodValue });
  const lastUpdated = result?.state?.updatedAt;

  return (
    <motion.div
      {...PANEL_MOTION}
      className="absolute inset-x-0 bottom-0 z-[10] flex max-h-[90dvh] flex-col rounded-t-xl border bg-background shadow-xl"
    >
      {/* Header */}
      <div className="flex flex-none items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden="true">
            {stateEmoji}
          </span>
          <h2 className="text-sm font-bold">Traveler State</h2>
          {lastUpdated && (
            <span className="text-xs text-muted-foreground" suppressHydrationWarning>
              · {formatRelativeTime(lastUpdated)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Traveler State"
          className="rounded-md p-1 hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex flex-none border-b">
        {(["state", "visibility"] as TabView[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setError(null);
            }}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "border-b-2 border-navy text-navy"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "state" ? "State" : "Visibility"}
          </button>
        ))}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
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
              <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                {prevAt ? `Last entry: ${formatRelativeTime(prevAt)}` : "No previous entry"}
              </p>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No changes from last entry.</p>
              ) : (
                <div className="grid gap-3">
                  {rows.map(({ label, from, to }) => (
                    <div key={label} className="grid gap-0.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {label}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm">
                        <span className={from ? "text-muted-foreground line-through" : "text-muted-foreground"}>
                          {from ?? "—"}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className={to ? "font-medium" : "text-muted-foreground"}>
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
          <div className="grid gap-5 p-4">
            {/* When */}
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  When
                </label>
                <button
                  type="button"
                  onClick={() => setStateAt("")}
                  className="text-xs text-navy hover:underline"
                >
                  Now
                </button>
              </div>
              <input
                type="datetime-local"
                value={stateAt || toIsoLocal(Date.now())}
                onChange={(e) => setStateAt(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>

            {/* Mood — chip only (#4) */}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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

            {/* Energy — chips + slider (#5, #6) */}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                  setEnergyScore(n);
                  setEnergyLevel(getEnergyLevelFromScore(n));
                }}
              />
            </div>

            {/* Stomach — chips + slider (#5, #6) */}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                  setStomachScore(n);
                  setStomachLevel(getStomachLevelFromScore(n));
                }}
              />
            </div>

            {/* Stress — chips + slider (#5, #6) */}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Stress
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
                  setStressScore(n);
                  setStressLevel(getStressLevelFromScore(n));
                }}
              />
            </div>

            {/* Schedule — chip only (#4) */}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status Note
                </label>
                <span className="text-xs text-muted-foreground">{statusNote.length}/240</span>
              </div>
              <textarea
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value.slice(0, 240))}
                rows={2}
                placeholder="How are you doing? (optional)"
                className="resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            {/* Status emoji */}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status Emoji
              </label>
              <input
                type="text"
                value={statusEmoji}
                onChange={(e) => setStatusEmoji(e.target.value.slice(0, 10))}
                maxLength={10}
                placeholder="e.g. 🏔️"
                className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>

            {/* Biometrics */}
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => setBiometricsOpen((p) => !p)}
                className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                <span>{biometricsOpen ? "▾" : "▸"}</span>
                Biometrics
              </button>
              {biometricsOpen && (
                <div className="grid gap-3 rounded-md border bg-muted/30 p-3">
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
                      <span className="text-xs text-muted-foreground">{biometricNote.length}/240</span>
                    </div>
                    <textarea
                      value={biometricNote}
                      onChange={(e) => setBiometricNote(e.target.value.slice(0, 240))}
                      rows={2}
                      placeholder="e.g. Worn Fitbit all day"
                      className="resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "visibility" && (
          <div className="grid gap-3 p-4">
            <p className="text-sm text-muted-foreground">Control what Support Crew can see.</p>

            <ToggleRow label="Show Traveler State" checked={showTravelerState} onChange={setShowTravelerState} />

            <div className="grid gap-2 pl-2">
              {[
                { label: "Mood", checked: showMood, setter: setShowMood },
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
      <div className="flex-none border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {savedAt && !error && tab === "state" && (
          <p className="mb-3 text-sm text-emerald-700" suppressHydrationWarning>
            Saved {formatRelativeTime(savedAt)}
          </p>
        )}
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
        ) : (
          <Button onClick={handleSaveVisibility} disabled={saving} className="w-full">
            {saving ? "Saving…" : "Save Visibility"}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

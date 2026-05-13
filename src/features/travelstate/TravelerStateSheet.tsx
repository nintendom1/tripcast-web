import { useState, useEffect } from "react";
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
} from "./travelerStateUtils";

type TravelerStateSheetProps = {
  token: string;
  onClose: () => void;
};

type TabView = "state" | "visibility";

const PANEL_MOTION = {
  initial: { y: "100%" },
  animate: { y: 0 },
  exit: { y: "100%" },
  transition: { duration: 0.22, ease: "easeOut" as const },
};

function ChipRow<T extends string>({
  values,
  labels,
  selected,
  onSelect,
}: {
  values: T[];
  labels: Record<T, string>;
  selected: T | undefined;
  onSelect: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onSelect(v)}
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

function ScoreInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min: number;
  max: number;
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
      placeholder="—"
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

export default function TravelerStateSheet({ token, onClose }: TravelerStateSheetProps) {
  const result = useQuery(tripcastApi.travelerState.travelerGetState, { token });
  const updateState = useMutation(tripcastApi.travelerState.travelerUpdateState);
  const updateVisibility = useMutation(tripcastApi.travelerState.travelerUpdateStateVisibility);

  const [tab, setTab] = useState<TabView>("state");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // State form
  const [stateAt, setStateAt] = useState<string>("");
  const [moodValue, setMoodValue] = useState<TravelerMoodValue | undefined>();
  const [moodScore, setMoodScore] = useState<number | undefined>();
  const [energyLevel, setEnergyLevel] = useState<TravelerEnergyLevel | undefined>();
  const [energyScore, setEnergyScore] = useState<number | undefined>();
  const [stomachLevel, setStomachLevel] = useState<TravelerStomachLevel | undefined>();
  const [stomachScore, setStomachScore] = useState<number | undefined>();
  const [stressLevel, setStressLevel] = useState<TravelerStressLevel | undefined>();
  const [stressScore, setStressScore] = useState<number | undefined>();
  const [scheduleLevel, setScheduleLevel] = useState<
    TravelerSchedulePressureLevel | undefined
  >();
  const [scheduleScore, setScheduleScore] = useState<number | undefined>();
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
  const [showTravelerState, setShowTravelerState] = useState(
    DEFAULT_VISIBILITY.showTravelerState,
  );
  const [showMood, setShowMood] = useState(DEFAULT_VISIBILITY.showMood);
  const [showEnergy, setShowEnergy] = useState(DEFAULT_VISIBILITY.showEnergy);
  const [showStomach, setShowStomach] = useState(DEFAULT_VISIBILITY.showStomach);
  const [showStress, setShowStress] = useState(DEFAULT_VISIBILITY.showStress);
  const [showSchedulePressure, setShowSchedulePressure] = useState(
    DEFAULT_VISIBILITY.showSchedulePressure,
  );
  const [showStatusNote, setShowStatusNote] = useState(DEFAULT_VISIBILITY.showStatusNote);
  const [showBiometrics, setShowBiometrics] = useState(DEFAULT_VISIBILITY.showBiometrics);

  // Populate form from loaded data
  useEffect(() => {
    if (!result) return;
    const { state, visibility } = result;
    if (state) {
      setMoodValue(state.moodValue);
      setMoodScore(state.moodScore);
      setEnergyLevel(state.energyLevel);
      setEnergyScore(state.energyScore);
      setStomachLevel(state.stomachLevel);
      setStomachScore(state.stomachScore);
      setStressLevel(state.stressLevel);
      setStressScore(state.stressScore);
      setScheduleLevel(state.schedulePressureLevel);
      setScheduleScore(state.schedulePressureScore);
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

  async function handleSaveState() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateState({
        token,
        stateAt: getStateAtMs(),
        moodValue,
        moodScore,
        energyLevel,
        energyScore,
        stomachLevel,
        stomachScore,
        stressLevel,
        stressScore,
        schedulePressureLevel: scheduleLevel,
        schedulePressureScore: scheduleScore,
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
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save state.");
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
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save visibility.");
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
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">
            {stateEmoji}
          </span>
          <h2 className="text-base font-bold">Traveler State</h2>
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
      <div className="flex border-b">
        {(["state", "visibility"] as TabView[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
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

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {tab === "state" && (
          <div className="grid gap-5 p-4">
            {/* When */}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                When
              </label>
              <input
                type="datetime-local"
                value={stateAt || toIsoLocal(Date.now())}
                onChange={(e) => setStateAt(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Defaults to now. Set earlier to log retroactively.
              </p>
            </div>

            {/* Mood */}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Mood
              </label>
              <ChipRow
                values={MOOD_VALUES}
                labels={MOOD_LABELS}
                selected={moodValue}
                onSelect={setMoodValue}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Score (0–100)</span>
                <ScoreInput value={moodScore} onChange={setMoodScore} min={0} max={100} />
              </div>
            </div>

            {/* Energy */}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Energy
              </label>
              <ChipRow
                values={ENERGY_VALUES}
                labels={ENERGY_LABELS}
                selected={energyLevel}
                onSelect={setEnergyLevel}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Score (0–100)</span>
                <ScoreInput value={energyScore} onChange={setEnergyScore} min={0} max={100} />
              </div>
            </div>

            {/* Stomach */}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Stomach
              </label>
              <ChipRow
                values={STOMACH_VALUES}
                labels={STOMACH_LABELS}
                selected={stomachLevel}
                onSelect={setStomachLevel}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Score (0–150)</span>
                <ScoreInput value={stomachScore} onChange={setStomachScore} min={0} max={150} />
              </div>
            </div>

            {/* Stress */}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Stress
              </label>
              <ChipRow
                values={STRESS_VALUES}
                labels={STRESS_LABELS}
                selected={stressLevel}
                onSelect={setStressLevel}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Score (0–100)</span>
                <ScoreInput value={stressScore} onChange={setStressScore} min={0} max={100} />
              </div>
            </div>

            {/* Schedule */}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Schedule
              </label>
              <ChipRow
                values={SCHEDULE_VALUES}
                labels={SCHEDULE_LABELS}
                selected={scheduleLevel}
                onSelect={setScheduleLevel}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Score (0–100)</span>
                <ScoreInput value={scheduleScore} onChange={setScheduleScore} min={0} max={100} />
              </div>
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
                className="rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>

            {/* Status emoji */}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status Emoji (optional override)
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
                    {
                      label: "Resting HR (bpm)",
                      value: restHr,
                      setter: setRestHr,
                      min: 20,
                      max: 200,
                    },
                    {
                      label: "Sleep (hrs)",
                      value: sleepHours,
                      setter: setSleepHours,
                      min: 0,
                      max: 24,
                    },
                    {
                      label: "Active min",
                      value: activeMin,
                      setter: setActiveMin,
                      min: 0,
                      max: 1440,
                    },
                  ].map(({ label, value, setter, min, max }) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <span className="text-sm">{label}</span>
                      <ScoreInput value={value} onChange={setter} min={min} max={max} />
                    </div>
                  ))}
                  <div className="grid gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Note</span>
                      <span className="text-xs text-muted-foreground">
                        {biometricNote.length}/240
                      </span>
                    </div>
                    <textarea
                      value={biometricNote}
                      onChange={(e) => setBiometricNote(e.target.value.slice(0, 240))}
                      rows={2}
                      placeholder="e.g. Worn Fitbit all day"
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            {savedAt && !error && (
              <p className="text-sm text-emerald-700">
                Saved {formatRelativeTime(savedAt)}
              </p>
            )}

            {lastUpdated && (
              <p className="text-xs text-muted-foreground">
                Last updated {formatRelativeTime(lastUpdated)}
              </p>
            )}

            <Button onClick={handleSaveState} disabled={saving} className="w-full">
              {saving ? "Saving…" : "Save State"}
            </Button>
          </div>
        )}

        {tab === "visibility" && (
          <div className="grid gap-3 p-4">
            <p className="text-sm text-muted-foreground">
              Control what Support Crew can see.
            </p>

            <ToggleRow
              label="Show Traveler State"
              checked={showTravelerState}
              onChange={setShowTravelerState}
            />

            <div className="grid gap-2 pl-2">
              {[
                { label: "Mood", checked: showMood, setter: setShowMood },
                { label: "Energy", checked: showEnergy, setter: setShowEnergy },
                { label: "Stomach", checked: showStomach, setter: setShowStomach },
                { label: "Stress", checked: showStress, setter: setShowStress },
                {
                  label: "Schedule",
                  checked: showSchedulePressure,
                  setter: setShowSchedulePressure,
                },
                { label: "Status Note", checked: showStatusNote, setter: setShowStatusNote },
                { label: "Biometrics", checked: showBiometrics, setter: setShowBiometrics },
              ].map(({ label, checked, setter }) => (
                <ToggleRow
                  key={label}
                  label={label}
                  checked={checked}
                  onChange={setter}
                />
              ))}
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            {savedAt && !error && (
              <p className="text-sm text-emerald-700">
                Saved {formatRelativeTime(savedAt)}
              </p>
            )}

            <Button onClick={handleSaveVisibility} disabled={saving} className="w-full">
              {saving ? "Saving…" : "Save Visibility"}
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

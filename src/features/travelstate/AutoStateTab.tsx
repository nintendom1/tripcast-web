import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { useDebugLogger, type DebugLogger } from "../../debug/useDebugLogger";
import { Button } from "../../components/ui/button";
import { InfoTooltip, type InfoTooltipPlacement } from "../../components/ui/info-tooltip";
import {
  AUTO_TICK_MS,
  PHASE_META,
  computeAutoState,
  getMinuteOfDayInTimeZone,
  getPhaseAtMinute,
  type AutoStatePhase,
} from "./autoStateCalc";
import { formatSaveError } from "./formatSaveError";
import {
  formatTimeOfDay,
  parseTimeOfDay,
  formatRelativeTime,
  getEnergyLevelFromScore,
  getStomachLevelFromScore,
} from "./travelerStateUtils";
import { TERMS } from "../../copy/terminology";

interface AutoStateTabProps {
  token: string;
  onToast?: (msg: string) => void;
}

const DEFAULT_AUTO_SETTINGS = {
  autoBedtimeMinutes: 23 * 60,
  autoWakeTimeMinutes: 9 * 60,
  autoEnergyMin: 20,
  autoEnergyMax: 80,
  autoStomachMin: 0,
  autoStomachMax: 150,
  autoEnergySleepDeltaPerTick: 1,
  autoEnergyAwakeDeltaPerTick: -1,
  autoStomachAwakeDeltaPerTick: -2,
  autoStomachNightAboveHungryEveryTicks: 2,
  autoStomachNightAtOrBelowHungryEveryTicks: 4,
};

function detectBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function formatClockTime(ts: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleTimeString();
  }
}

function formatElapsedLong(ts: number, now: number): string {
  const ms = Math.max(0, now - ts);
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`;
}

function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  ariaLabel: string;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return;
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        onChange(Math.round(n));
      }}
      aria-label={ariaLabel}
      className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm"
    />
  );
}

function AutoChip() {
  return (
    <span
      className="ml-1 inline-flex items-center rounded-full bg-navy/10 px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-navy"
      aria-label="Auto-estimated"
    >
      AUTO
    </span>
  );
}

interface PhaseSegment {
  phase: AutoStatePhase;
  startMinute: number;
  endMinute: number;
}

function buildPhaseSegments(
  enabledAt: number,
  timeZone: string,
  bedtimeMinutes: number,
  wakeTimeMinutes: number,
): PhaseSegment[] {
  // Sample once per tick (96 samples across 24h), then group consecutive same-phase runs.
  const segments: PhaseSegment[] = [];
  for (let i = 0; i < 96; i++) {
    const minute = getMinuteOfDayInTimeZone(enabledAt + i * AUTO_TICK_MS, timeZone);
    const phase = getPhaseAtMinute(minute, bedtimeMinutes, wakeTimeMinutes);
    const last = segments[segments.length - 1];
    if (last && last.phase === phase) {
      last.endMinute = (i + 1) * 15;
    } else {
      segments.push({ phase, startMinute: i * 15, endMinute: (i + 1) * 15 });
    }
  }
  return segments;
}

function logTooltipOpen(
  log: DebugLogger,
  id: string,
  open: boolean,
  placement?: InfoTooltipPlacement,
) {
  if (!open) return;
  log.logUi("tooltip:open", { id, placement });
}

export default function AutoStateTab({ token, onToast }: AutoStateTabProps) {
  const log: DebugLogger = useDebugLogger("AutoStateTab", "src/features/travelstate/AutoStateTab.tsx");

  const autoState = useQuery(tripcastApi.travelerAutoState.travelerGetAutoState, { token });
  const setEnabled = useMutation(tripcastApi.travelerAutoState.travelerSetAutoStateEnabled);
  const updateSettings = useMutation(tripcastApi.travelerAutoState.travelerUpdateAutoStateSettings);
  const rebaseTimeZone = useMutation(tripcastApi.travelerAutoState.travelerRebaseAutoStateTimeZone);
  const updateState = useMutation(tripcastApi.travelerState.travelerUpdateState);

  const hasPopulatedRef = useRef(false);
  const rebasePromptLoggedRef = useRef(false);

  const [now, setNow] = useState(() => Date.now());
  const [scrubOffsetTicks, setScrubOffsetTicks] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [applying, setApplying] = useState(false);
  const [rebasing, setRebasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local form state
  const [bedtime, setBedtime] = useState<number>(DEFAULT_AUTO_SETTINGS.autoBedtimeMinutes);
  const [wakeTime, setWakeTime] = useState<number>(DEFAULT_AUTO_SETTINGS.autoWakeTimeMinutes);
  const [energyMin, setEnergyMin] = useState<number>(DEFAULT_AUTO_SETTINGS.autoEnergyMin);
  const [energyMax, setEnergyMax] = useState<number>(DEFAULT_AUTO_SETTINGS.autoEnergyMax);
  const [stomachMin, setStomachMin] = useState<number>(DEFAULT_AUTO_SETTINGS.autoStomachMin);
  const [stomachMax, setStomachMax] = useState<number>(DEFAULT_AUTO_SETTINGS.autoStomachMax);
  const [energySleepDelta, setEnergySleepDelta] = useState<number>(DEFAULT_AUTO_SETTINGS.autoEnergySleepDeltaPerTick);
  const [energyAwakeDelta, setEnergyAwakeDelta] = useState<number>(DEFAULT_AUTO_SETTINGS.autoEnergyAwakeDeltaPerTick);
  const [stomachAwakeDelta, setStomachAwakeDelta] = useState<number>(DEFAULT_AUTO_SETTINGS.autoStomachAwakeDeltaPerTick);
  const [stomachAboveEvery, setStomachAboveEvery] = useState<number>(DEFAULT_AUTO_SETTINGS.autoStomachNightAboveHungryEveryTicks);
  const [stomachBelowEvery, setStomachBelowEvery] = useState<number>(DEFAULT_AUTO_SETTINGS.autoStomachNightAtOrBelowHungryEveryTicks);

  // Populate the form once when the query resolves.
  useEffect(() => {
    if (!autoState || hasPopulatedRef.current) return;
    hasPopulatedRef.current = true;
    setBedtime(autoState.autoBedtimeMinutes);
    setWakeTime(autoState.autoWakeTimeMinutes);
    setEnergyMin(autoState.autoEnergyMin);
    setEnergyMax(autoState.autoEnergyMax);
    setStomachMin(autoState.autoStomachMin);
    setStomachMax(autoState.autoStomachMax);
    setEnergySleepDelta(autoState.autoEnergySleepDeltaPerTick);
    setEnergyAwakeDelta(autoState.autoEnergyAwakeDeltaPerTick);
    setStomachAwakeDelta(autoState.autoStomachAwakeDeltaPerTick);
    setStomachAboveEvery(autoState.autoStomachNightAboveHungryEveryTicks);
    setStomachBelowEvery(autoState.autoStomachNightAtOrBelowHungryEveryTicks);
    log.logForm("form:open", { source: "travelerGetAutoState" });
  }, [autoState, log]);

  // Refresh ticker.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const detectedTz = useMemo(() => detectBrowserTimeZone(), []);
  const storedTz = autoState?.autoTimeZone ?? "UTC";
  const tzMismatch = Boolean(
    autoState?.autoStateEnabled && storedTz && detectedTz && storedTz !== detectedTz,
  );

  // Log the rebase prompt once per mount.
  useEffect(() => {
    if (tzMismatch && !rebasePromptLoggedRef.current) {
      rebasePromptLoggedRef.current = true;
      log.logUi("auto:rebase:prompt-shown", { stored: storedTz, device: detectedTz });
    }
  }, [tzMismatch, storedTz, detectedTz, log]);

  const enabled = Boolean(autoState?.autoStateEnabled);
  const enabledAt = autoState?.autoEnabledAt;
  const baseEnergy = autoState?.autoBaseEnergyScore;
  const baseStomach = autoState?.autoBaseStomachScore;

  // Live estimate at "now".
  const liveEstimate = useMemo(() => {
    if (!enabled || enabledAt == null || baseEnergy == null || baseStomach == null) return null;
    return computeAutoState({
      autoTimeZone: storedTz,
      autoBedtimeMinutes: autoState!.autoBedtimeMinutes,
      autoWakeTimeMinutes: autoState!.autoWakeTimeMinutes,
      autoEnergyMin: autoState!.autoEnergyMin,
      autoEnergyMax: autoState!.autoEnergyMax,
      autoStomachMin: autoState!.autoStomachMin,
      autoStomachMax: autoState!.autoStomachMax,
      autoEnergySleepDeltaPerTick: autoState!.autoEnergySleepDeltaPerTick,
      autoEnergyAwakeDeltaPerTick: autoState!.autoEnergyAwakeDeltaPerTick,
      autoStomachAwakeDeltaPerTick: autoState!.autoStomachAwakeDeltaPerTick,
      autoStomachNightAboveHungryEveryTicks: autoState!.autoStomachNightAboveHungryEveryTicks,
      autoStomachNightAtOrBelowHungryEveryTicks: autoState!.autoStomachNightAtOrBelowHungryEveryTicks,
      baseEnergy,
      baseStomach,
      autoEnabledAt: enabledAt,
      targetTime: now,
    });
  }, [enabled, enabledAt, baseEnergy, baseStomach, autoState, storedTz, now]);

  // Preview estimate for the scrubber: uses persisted settings + base, but
  // targets `now + scrubOffsetTicks * AUTO_TICK_MS`.
  const previewEstimate = useMemo(() => {
    if (!enabled || enabledAt == null || baseEnergy == null || baseStomach == null) return null;
    return computeAutoState({
      autoTimeZone: storedTz,
      autoBedtimeMinutes: autoState!.autoBedtimeMinutes,
      autoWakeTimeMinutes: autoState!.autoWakeTimeMinutes,
      autoEnergyMin: autoState!.autoEnergyMin,
      autoEnergyMax: autoState!.autoEnergyMax,
      autoStomachMin: autoState!.autoStomachMin,
      autoStomachMax: autoState!.autoStomachMax,
      autoEnergySleepDeltaPerTick: autoState!.autoEnergySleepDeltaPerTick,
      autoEnergyAwakeDeltaPerTick: autoState!.autoEnergyAwakeDeltaPerTick,
      autoStomachAwakeDeltaPerTick: autoState!.autoStomachAwakeDeltaPerTick,
      autoStomachNightAboveHungryEveryTicks: autoState!.autoStomachNightAboveHungryEveryTicks,
      autoStomachNightAtOrBelowHungryEveryTicks: autoState!.autoStomachNightAtOrBelowHungryEveryTicks,
      baseEnergy,
      baseStomach,
      autoEnabledAt: enabledAt,
      targetTime: now + scrubOffsetTicks * AUTO_TICK_MS,
    });
  }, [enabled, enabledAt, baseEnergy, baseStomach, autoState, storedTz, now, scrubOffsetTicks]);

  const segments = useMemo(() => {
    if (!enabled || enabledAt == null) return [];
    return buildPhaseSegments(now, storedTz, autoState!.autoBedtimeMinutes, autoState!.autoWakeTimeMinutes);
  }, [enabled, enabledAt, now, storedTz, autoState]);

  async function handleToggle(nextEnabled: boolean) {
    if (toggling) return;
    setError(null);
    setToggling(true);
    const tz = detectBrowserTimeZone();
    log.logUi("auto:toggle", { enabled: nextEnabled });
    log.logMutation("travelerSetAutoStateEnabled", { enabled: nextEnabled });
    try {
      await setEnabled({ token, enabled: nextEnabled, timeZone: tz });
      log.logMutation("travelerSetAutoStateEnabled:success");
      onToast?.(nextEnabled ? "Auto State enabled." : "Auto State disabled.");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.error("travelerSetAutoStateEnabled:error", "mutation", { message });
      setError(formatSaveError(e));
    } finally {
      setToggling(false);
    }
  }

  async function handleSaveSettings() {
    if (saving) return;
    setError(null);
    if (energyMin > energyMax) {
      setError("Energy min cannot exceed energy max.");
      return;
    }
    if (stomachMin > stomachMax) {
      setError("Stomach min cannot exceed stomach max.");
      return;
    }
    if (stomachAboveEvery < 1 || stomachBelowEvery < 1) {
      setError("Tick intervals must be at least 1.");
      return;
    }
    setSaving(true);
    log.logForm("form:submit", { kind: "auto-settings" });
    log.logMutation("travelerUpdateAutoStateSettings");
    try {
      await updateSettings({
        token,
        autoBedtimeMinutes: bedtime,
        autoWakeTimeMinutes: wakeTime,
        autoEnergyMin: energyMin,
        autoEnergyMax: energyMax,
        autoStomachMin: stomachMin,
        autoStomachMax: stomachMax,
        autoEnergySleepDeltaPerTick: energySleepDelta,
        autoEnergyAwakeDeltaPerTick: energyAwakeDelta,
        autoStomachAwakeDeltaPerTick: stomachAwakeDelta,
        autoStomachNightAboveHungryEveryTicks: stomachAboveEvery,
        autoStomachNightAtOrBelowHungryEveryTicks: stomachBelowEvery,
      });
      log.logMutation("travelerUpdateAutoStateSettings:success");
      onToast?.("Auto settings saved.");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.error("travelerUpdateAutoStateSettings:error", "mutation", { message });
      setError(formatSaveError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyEstimate() {
    if (applying || !liveEstimate) return;
    setError(null);
    setApplying(true);
    log.logUi("auto:apply", {});
    log.logMutation("travelerUpdateState", { source: "auto:apply" });
    try {
      await updateState({
        token,
        stateAt: Date.now(),
        energyScore: liveEstimate.estimatedEnergy,
        energyLevel: getEnergyLevelFromScore(liveEstimate.estimatedEnergy),
        stomachScore: liveEstimate.estimatedStomach,
        stomachLevel: getStomachLevelFromScore(liveEstimate.estimatedStomach),
      });
      log.logMutation("travelerUpdateState:success", { source: "auto:apply" });
      onToast?.("Estimate applied.");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.error("travelerUpdateState:error", "mutation", { message });
      setError(formatSaveError(e));
    } finally {
      setApplying(false);
    }
  }

  async function handleRebase() {
    if (rebasing || !liveEstimate) return;
    setError(null);
    setRebasing(true);
    log.logUi("auto:rebase", { stored: storedTz, device: detectedTz });
    log.logMutation("travelerRebaseAutoStateTimeZone");
    try {
      await rebaseTimeZone({
        token,
        newTimeZone: detectedTz,
        rebasedEstimatedEnergy: liveEstimate.estimatedEnergy,
        rebasedEstimatedStomach: liveEstimate.estimatedStomach,
      });
      log.logMutation("travelerRebaseAutoStateTimeZone:success");
      onToast?.(`Auto State rebased to ${detectedTz}.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.error("travelerRebaseAutoStateTimeZone:error", "mutation", { message });
      setError(formatSaveError(e));
    } finally {
      setRebasing(false);
    }
  }

  const loading = autoState === undefined;

  return (
    <div className="grid gap-5 p-4">
      {/* Toggle */}
      <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2.5">
        <span className="text-sm font-medium">{TERMS.autoState}</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={loading || toggling}
          onClick={() => handleToggle(!enabled)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            enabled ? "bg-navy" : "bg-muted"
          } ${loading || toggling ? "opacity-60" : ""}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Estimated locally. Not shared as a manual save until applied.
      </p>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {tzMismatch && (
        <div className="grid gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">⚠ Timezone changed</div>
          <div className="text-xs">
            Stored: {storedTz}
            <br />
            Device: {detectedTz}
            <br />
            Auto State phase windows are still using the stored timezone.
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={rebasing}
            onClick={handleRebase}
            className="w-full"
          >
            {rebasing ? "Rebasing…" : `Rebase ${TERMS.autoState} to ${detectedTz}`}
          </Button>
        </div>
      )}

      {enabled && enabledAt != null && (
        <div className="grid gap-1.5 rounded-md border bg-background p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {TERMS.autoEstimated} base
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span>Energy: {baseEnergy ?? "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span>Stomach: {baseStomach ?? "—"}</span>
          </div>
          <div className="text-xs text-muted-foreground" suppressHydrationWarning>
            Started: {formatClockTime(enabledAt, storedTz)} ({formatElapsedLong(enabledAt, now)})
          </div>
        </div>
      )}

      {enabled && liveEstimate && (
        <div className="grid gap-1.5 rounded-md border bg-background p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Estimate now
          </div>
          <div className="flex items-center gap-1 text-sm">
            <span>Energy {liveEstimate.estimatedEnergy}</span>
            <AutoChip />
          </div>
          <div className="flex items-center gap-1 text-sm">
            <span>Stomach {liveEstimate.estimatedStomach}</span>
            <AutoChip />
          </div>
        </div>
      )}

      {enabled && previewEstimate && (
        <div className="grid gap-2 rounded-md border bg-background p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            24-hour preview
          </div>
          <input
            type="range"
            min={0}
            max={96}
            step={1}
            value={scrubOffsetTicks}
            onChange={(e) => {
              const v = Number(e.target.value);
              setScrubOffsetTicks(v);
              log.logUi("auto:scrub", { offsetTicks: v });
            }}
            aria-label="24-hour preview scrubber"
            className="w-full accent-navy"
          />
          {segments.length > 0 && (
            <div
              className="relative h-5 w-full overflow-hidden rounded-sm border"
              aria-label="24-hour phase strip"
            >
              <div className="flex h-full w-full" aria-hidden="true">
                {segments.map((seg, i) => {
                  const widthPct = ((seg.endMinute - seg.startMinute) / 1440) * 100;
                  return (
                    <div
                      key={i}
                      className="bg-muted"
                      style={{ width: `${widthPct}%` }}
                    />
                  );
                })}
              </div>
              {segments.map((seg, i) => {
                return (
                  <span
                    key={i}
                    className="absolute top-1/2 text-[10px] leading-none"
                    style={{
                      left: `${(seg.startMinute / 1440) * 100}%`,
                      transform:
                        seg.startMinute === 0
                          ? "translateY(-50%)"
                          : "translate(-50%, -50%)",
                    }}
                    aria-label={PHASE_META[seg.phase].label}
                  >
                    {PHASE_META[seg.phase].emoji}
                  </span>
                );
              })}
            </div>
          )}
          <div className="grid gap-0.5 text-xs">
            <div>
              At +{(scrubOffsetTicks / 4).toFixed(scrubOffsetTicks % 4 === 0 ? 0 : 2)}h
            </div>
            <div>
              Phase: {previewEstimate.phaseLabel} {previewEstimate.phaseEmoji}
            </div>
            <div>Energy: {previewEstimate.estimatedEnergy}</div>
            <div>Stomach: {previewEstimate.estimatedStomach}</div>
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="grid gap-3 rounded-md border bg-background p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Settings
        </div>

        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground" htmlFor="auto-bedtime">
            Bedtime
          </label>
          <input
            id="auto-bedtime"
            type="time"
            value={`${String(Math.floor(bedtime / 60)).padStart(2, "0")}:${String(bedtime % 60).padStart(2, "0")}`}
            onChange={(e) => {
              const m = parseTimeOfDay(e.target.value);
              if (m !== null) setBedtime(m);
            }}
            className="h-9 w-32 rounded-md border border-input bg-background px-3 text-sm"
          />
          <div className="text-[10px] text-muted-foreground">{formatTimeOfDay(bedtime)}</div>
        </div>

        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground" htmlFor="auto-waketime">
            Wake time
          </label>
          <input
            id="auto-waketime"
            type="time"
            value={`${String(Math.floor(wakeTime / 60)).padStart(2, "0")}:${String(wakeTime % 60).padStart(2, "0")}`}
            onChange={(e) => {
              const m = parseTimeOfDay(e.target.value);
              if (m !== null) setWakeTime(m);
            }}
            className="h-9 w-32 rounded-md border border-input bg-background px-3 text-sm"
          />
          <div className="text-[10px] text-muted-foreground">{formatTimeOfDay(wakeTime)}</div>
        </div>

        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Energy min / max</span>
          <div className="flex items-center gap-2 text-sm">
            <NumberStepper
              value={energyMin}
              onChange={setEnergyMin}
              min={0}
              max={100}
              ariaLabel="Energy minimum"
            />
            <span>/</span>
            <NumberStepper
              value={energyMax}
              onChange={setEnergyMax}
              min={0}
              max={100}
              ariaLabel="Energy maximum"
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Stomach min / max</span>
          <div className="flex items-center gap-2 text-sm">
            <NumberStepper
              value={stomachMin}
              onChange={setStomachMin}
              min={0}
              max={150}
              ariaLabel="Stomach minimum"
            />
            <span>/</span>
            <NumberStepper
              value={stomachMax}
              onChange={setStomachMax}
              min={0}
              max={150}
              ariaLabel="Stomach maximum"
            />
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Rates
            </div>
            <div className="text-xs text-muted-foreground">1 tick = 15 minutes.</div>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>Energy while asleep (per 15 min)</span>
            <NumberStepper
              value={energySleepDelta}
              onChange={setEnergySleepDelta}
              min={-20}
              max={20}
              ariaLabel="Energy while asleep delta per tick"
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>Energy while awake (per 15 min)</span>
            <NumberStepper
              value={energyAwakeDelta}
              onChange={setEnergyAwakeDelta}
              min={-20}
              max={20}
              ariaLabel="Energy while awake delta per tick"
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>Stomach while awake (per 15 min)</span>
            <NumberStepper
              value={stomachAwakeDelta}
              onChange={setStomachAwakeDelta}
              min={-20}
              max={20}
              ariaLabel="Stomach while awake delta per tick"
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="inline-flex items-center gap-1">
              Stomach night &gt;50: -1 every N ticks
              <InfoTooltip
                label="About Stomach night above Hungry rate"
                onOpenChange={(open, placement) =>
                  logTooltipOpen(log, "stomach-night-above", open, placement)
                }
              >
                While the Traveler is asleep and Stomach is above Hungry (&gt;50),
                Stomach drops 1 point every N ticks. Default N=2 → one point every
                30 minutes. Lower N = faster overnight decay; higher N = slower.
              </InfoTooltip>
            </span>
            <NumberStepper
              value={stomachAboveEvery}
              onChange={setStomachAboveEvery}
              min={1}
              max={96}
              ariaLabel="Stomach night above-hungry every ticks"
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="inline-flex items-center gap-1">
              Stomach night ≤50: -1 every N ticks
              <InfoTooltip
                label="About Stomach night at-or-below Hungry rate"
                onOpenChange={(open, placement) =>
                  logTooltipOpen(log, "stomach-night-below", open, placement)
                }
              >
                While the Traveler is asleep and Stomach is at or below Hungry
                (≤50), Stomach drops 1 point every N ticks. Default N=4 → one
                point every 60 minutes. Designed slower than the &gt;50 case so
                the body conserves once already hungry.
              </InfoTooltip>
            </span>
            <NumberStepper
              value={stomachBelowEvery}
              onChange={setStomachBelowEvery}
              min={1}
              max={96}
              ariaLabel="Stomach night at-or-below-hungry every ticks"
            />
          </div>
        </div>

        <div className="text-xs text-muted-foreground">Timezone: {storedTz}</div>

        <Button
          type="button"
          onClick={handleSaveSettings}
          disabled={saving}
          className="w-full"
        >
          {saving ? "Saving…" : "Save Auto settings"}
        </Button>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={handleApplyEstimate}
        disabled={applying || !liveEstimate}
        className="w-full"
      >
        {applying ? "Applying…" : "Apply estimate to saved State"}
      </Button>

      {enabled && lastUpdatedLine(autoState?.updatedAt) && (
        <p className="text-[10px] text-muted-foreground" suppressHydrationWarning>
          Settings last saved {formatRelativeTime(autoState!.updatedAt!)}
        </p>
      )}
    </div>
  );
}

function lastUpdatedLine(ts: number | null | undefined): boolean {
  return typeof ts === "number" && Number.isFinite(ts);
}

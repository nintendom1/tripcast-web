import * as React from "react";
import { useMutation, useQuery } from "convex/react";

import {
  tripcastApi,
  type AutoState,
  type AutoStateForFollower,
  type CurrentActivity,
  type Role,
  type TravelerEnergyLevel,
  type TravelerStateForFollower,
  type TravelerStomachLevel,
  type TravelerStressLevel,
} from "@/convex/tripcastApi";
import {
  ENERGY_SCORE_FOR_LEVEL,
  STOMACH_SCORE_FOR_LEVEL,
  STRESS_SCORE_FOR_LEVEL,
} from "@/features/travelstate/travelerStateUtils";
import { computeAutoState } from "@/features/travelstate/autoStateCalc";

import { StatusCard, type StatusCardMeter } from "./StatusCard";

export interface StatusCardConnectedProps {
  token: string;
  role: Role;
  onOpenState: () => void;
  className?: string;
}

type StateFacts = {
  energyLevel?: TravelerEnergyLevel;
  energyScore?: number;
  stomachLevel?: TravelerStomachLevel;
  stomachScore?: number;
  stressLevel?: TravelerStressLevel;
  stressScore?: number;
  updatedAt?: number | null;
};

function formatElapsed(startedAt: number, now: number): string {
  const ms = Math.max(0, now - startedAt);
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function resolveScore<TLevel extends string>(
  score: number | undefined,
  level: TLevel | undefined,
  table: Record<TLevel, number>,
  fallback: number,
): number {
  if (typeof score === "number" && Number.isFinite(score)) return score;
  if (level !== undefined && table[level] !== undefined) return table[level];
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Normalizes the role-specific auto-state shape into a uniform record the calc
 * helper can consume. Returns null when Auto is off / not visible.
 */
type NormalizedAuto = {
  autoStateEnabled: true;
  autoEnabledAt: number;
  autoTimeZone: string;
  autoBaseEnergyScore?: number;
  autoBaseStomachScore?: number;
  autoBedtimeMinutes: number;
  autoWakeTimeMinutes: number;
  autoEnergyMin: number;
  autoEnergyMax: number;
  autoStomachMin: number;
  autoStomachMax: number;
  autoEnergySleepDeltaPerTick: number;
  autoEnergyAwakeDeltaPerTick: number;
  autoStomachAwakeDeltaPerTick: number;
  autoStomachNightAboveHungryEveryTicks: number;
  autoStomachNightAtOrBelowHungryEveryTicks: number;
};

function normalizeTraveler(auto: AutoState | undefined | null): NormalizedAuto | null {
  if (!auto || !auto.autoStateEnabled || auto.autoEnabledAt == null) return null;
  return {
    autoStateEnabled: true,
    autoEnabledAt: auto.autoEnabledAt,
    autoTimeZone: auto.autoTimeZone,
    autoBaseEnergyScore: auto.autoBaseEnergyScore,
    autoBaseStomachScore: auto.autoBaseStomachScore,
    autoBedtimeMinutes: auto.autoBedtimeMinutes,
    autoWakeTimeMinutes: auto.autoWakeTimeMinutes,
    autoEnergyMin: auto.autoEnergyMin,
    autoEnergyMax: auto.autoEnergyMax,
    autoStomachMin: auto.autoStomachMin,
    autoStomachMax: auto.autoStomachMax,
    autoEnergySleepDeltaPerTick: auto.autoEnergySleepDeltaPerTick,
    autoEnergyAwakeDeltaPerTick: auto.autoEnergyAwakeDeltaPerTick,
    autoStomachAwakeDeltaPerTick: auto.autoStomachAwakeDeltaPerTick,
    autoStomachNightAboveHungryEveryTicks: auto.autoStomachNightAboveHungryEveryTicks,
    autoStomachNightAtOrBelowHungryEveryTicks: auto.autoStomachNightAtOrBelowHungryEveryTicks,
  };
}

function normalizeFollower(auto: AutoStateForFollower | undefined | null): NormalizedAuto | null {
  if (!auto || !("visible" in auto) || !auto.visible) return null;
  if (!auto.autoStateEnabled) return null;
  if (auto.autoEnabledAt == null) return null;
  if (typeof auto.autoTimeZone !== "string") return null;
  return {
    autoStateEnabled: true,
    autoEnabledAt: auto.autoEnabledAt,
    autoTimeZone: auto.autoTimeZone,
    autoBaseEnergyScore: auto.autoBaseEnergyScore,
    autoBaseStomachScore: auto.autoBaseStomachScore,
    autoBedtimeMinutes: auto.autoBedtimeMinutes,
    autoWakeTimeMinutes: auto.autoWakeTimeMinutes,
    autoEnergyMin: auto.autoEnergyMin,
    autoEnergyMax: auto.autoEnergyMax,
    autoStomachMin: auto.autoStomachMin,
    autoStomachMax: auto.autoStomachMax,
    autoEnergySleepDeltaPerTick: auto.autoEnergySleepDeltaPerTick,
    autoEnergyAwakeDeltaPerTick: auto.autoEnergyAwakeDeltaPerTick,
    autoStomachAwakeDeltaPerTick: auto.autoStomachAwakeDeltaPerTick,
    autoStomachNightAboveHungryEveryTicks: auto.autoStomachNightAboveHungryEveryTicks,
    autoStomachNightAtOrBelowHungryEveryTicks: auto.autoStomachNightAtOrBelowHungryEveryTicks,
  };
}

function formatTravelerClock(now: number, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(new Date(now));
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;
    const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value;
    if (!hour || !minute || !dayPeriod) return null;
    return `${hour}:${minute} ${dayPeriod.toUpperCase()}`;
  } catch {
    return null;
  }
}

function detectBrowserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function formatBaseSavedAgo(ts: number, now: number): string {
  const mins = Math.floor(Math.max(0, now - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`;
}

/**
 * StatusCard wired to live Convex data — replaces the legacy stacked
 * TravelerStateCard + CurrentActivityCard pair.
 *
 * Reuses the same queries the legacy cards used; Convex deduplicates so this
 * does not add network traffic during the transition window.
 */
export function StatusCardConnected({
  token,
  role,
  onOpenState,
  className,
}: StatusCardConnectedProps) {
  const travelerState = useQuery(
    tripcastApi.travelerState.travelerGetState,
    role === "traveler" ? { token } : "skip",
  );
  const followerState = useQuery(
    tripcastApi.travelerState.followerGetTravelerState,
    role === "follower" ? { token } : "skip",
  );

  const travelerActivity = useQuery(
    tripcastApi.currentActivity.travelerGetCurrentActivity,
    role === "traveler" ? { token } : "skip",
  );
  const followerActivity = useQuery(
    tripcastApi.currentActivity.followerGetCurrentActivity,
    role === "follower" ? { token } : "skip",
  );

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
  const ensureTimeZone = useMutation(tripcastApi.travelerPreferences.travelerEnsureTimeZone);
  const ensureAttemptedRef = React.useRef<string | null>(null);

  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const detectedTimeZone = React.useMemo(() => detectBrowserTimeZone(), []);

  React.useEffect(() => {
    if (role !== "traveler") return;
    if (!detectedTimeZone || travelerPreferences === undefined) return;
    if (travelerPreferences.travelerTimeZone) return;

    const attemptKey = `${token}:${detectedTimeZone}`;
    if (ensureAttemptedRef.current === attemptKey) return;
    ensureAttemptedRef.current = attemptKey;
    ensureTimeZone({ token, timeZone: detectedTimeZone, source: "device" }).catch(() => {
      ensureAttemptedRef.current = null;
    });
  }, [detectedTimeZone, ensureTimeZone, role, token, travelerPreferences]);

  const auto = React.useMemo<NormalizedAuto | null>(() => {
    if (role === "traveler") return normalizeTraveler(travelerAutoState);
    return normalizeFollower(followerAutoState);
  }, [role, travelerAutoState, followerAutoState]);

  const clockTimeZone =
    role === "traveler"
      ? travelerPreferences && travelerPreferences.travelerTimeZone
        ? travelerPreferences.travelerTimeZone
        : null
      : followerPreferences &&
          "visible" in followerPreferences &&
          followerPreferences.visible &&
          typeof followerPreferences.travelerTimeZone === "string"
        ? followerPreferences.travelerTimeZone
        : null;
  const clockLabel = clockTimeZone ? formatTravelerClock(now, clockTimeZone) : null;

  const stateFacts: StateFacts | null = React.useMemo(() => {
    if (role === "traveler") {
      if (!travelerState || !travelerState.state) return null;
      const s = travelerState.state;
      return {
        energyLevel: s.energyLevel,
        energyScore: s.energyScore,
        stomachLevel: s.stomachLevel,
        stomachScore: s.stomachScore,
        stressLevel: s.stressLevel,
        stressScore: s.stressScore,
        updatedAt: s.updatedAt,
      };
    }
    const follower = followerState as TravelerStateForFollower | null | undefined;
    if (!follower || !follower.visible) return null;
    return {
      energyLevel: follower.energyLevel,
      energyScore: follower.energyScore,
      stomachLevel: follower.stomachLevel,
      stomachScore: follower.stomachScore,
      stressLevel: follower.stressLevel,
      stressScore: follower.stressScore,
      updatedAt: follower.updatedAt,
    };
  }, [role, travelerState, followerState]);

  const activity: CurrentActivity | null = role === "traveler"
    ? (travelerActivity ?? null)
    : (followerActivity ?? null);

  if (
    (role === "traveler" && travelerState === undefined && travelerActivity === undefined) ||
    (role === "follower" && followerState === undefined && followerActivity === undefined)
  ) {
    return null;
  }

  const isAutoEnergyOn = Boolean(auto && typeof auto.autoBaseEnergyScore === "number");
  const isAutoStomachOn = Boolean(auto && typeof auto.autoBaseStomachScore === "number");

  const autoEnergyResult = isAutoEnergyOn && auto
    ? computeAutoState({
        autoTimeZone: auto.autoTimeZone,
        autoBedtimeMinutes: auto.autoBedtimeMinutes,
        autoWakeTimeMinutes: auto.autoWakeTimeMinutes,
        autoEnergyMin: auto.autoEnergyMin,
        autoEnergyMax: auto.autoEnergyMax,
        autoStomachMin: auto.autoStomachMin,
        autoStomachMax: auto.autoStomachMax,
        autoEnergySleepDeltaPerTick: auto.autoEnergySleepDeltaPerTick,
        autoEnergyAwakeDeltaPerTick: auto.autoEnergyAwakeDeltaPerTick,
        autoStomachAwakeDeltaPerTick: auto.autoStomachAwakeDeltaPerTick,
        autoStomachNightAboveHungryEveryTicks: auto.autoStomachNightAboveHungryEveryTicks,
        autoStomachNightAtOrBelowHungryEveryTicks: auto.autoStomachNightAtOrBelowHungryEveryTicks,
        baseEnergy: auto.autoBaseEnergyScore ?? 50,
        baseStomach: auto.autoBaseStomachScore ?? 50,
        autoEnabledAt: auto.autoEnabledAt,
        targetTime: now,
      })
    : null;

  const meters: StatusCardMeter[] = stateFacts
    ? (() => {
        const energyValue = isAutoEnergyOn && autoEnergyResult
          ? autoEnergyResult.estimatedEnergy
          : resolveScore(
              stateFacts.energyScore,
              stateFacts.energyLevel,
              ENERGY_SCORE_FOR_LEVEL,
              50,
            );
        const stomachValue = isAutoStomachOn && autoEnergyResult
          ? autoEnergyResult.estimatedStomach
          : (() => {
              const raw = stateFacts.stomachScore;
              if (typeof raw === "number") return clamp(raw, 0, 150);
              return resolveScore(undefined, stateFacts.stomachLevel, STOMACH_SCORE_FOR_LEVEL, 50);
            })();
        const stressValue = resolveScore(
          stateFacts.stressScore,
          stateFacts.stressLevel,
          STRESS_SCORE_FOR_LEVEL,
          50,
        );
        return [
          { label: "Energy", value: energyValue, max: 100, autoChip: isAutoEnergyOn },
          { label: "Stomach", value: stomachValue, max: 150, autoChip: isAutoStomachOn },
          { label: "Calm", value: Math.max(0, Math.min(100, 100 - stressValue)), max: 100 },
        ];
      })()
    : [];

  // Follower-only: when Auto is on with no active activity, replace the activity-since
  // slot with the "AUTO EST. · base saved …" label.
  const followerAutoActive = role === "follower" && auto != null;
  const followerActivityLabelOverride =
    followerAutoActive && !activity
      ? `AUTO EST. · base saved ${formatBaseSavedAgo(auto!.autoEnabledAt, now)}`
      : null;

  return (
    <div className={className}>
      <StatusCard
        activityLabel={activity ? activity.title : followerActivityLabelOverride ?? null}
        activityEmoji={activity?.emoji ?? null}
        activitySince={activity ? formatElapsed(activity.startedAt, now) : null}
        clockLabel={clockLabel}
        meters={meters}
        interactive={role === "traveler"}
        onActivate={role === "traveler" ? onOpenState : undefined}
      />
      {followerAutoActive && (isAutoEnergyOn || isAutoStomachOn) ? (
        <p className="mt-1 text-[10px] text-[var(--ink-3)]">
          These values are estimated locally from the Traveler's saved State. They may not reflect a manual update.
        </p>
      ) : null}
    </div>
  );
}

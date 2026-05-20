import * as React from "react";
import { useQuery } from "convex/react";

import {
  tripcastApi,
  type AutoState,
  type AutoStateForCrew,
  type CurrentActivity,
  type Role,
  type TravelerEnergyLevel,
  type TravelerStateForCrew,
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

function normalizeCrew(auto: AutoStateForCrew | undefined | null): NormalizedAuto | null {
  if (!auto || !("visible" in auto) || !auto.visible) return null;
  if (!auto.autoStateEnabled) return null;
  if (auto.autoEnabledAt == null) return null;
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
  const crewState = useQuery(
    tripcastApi.travelerState.supportCrewGetTravelerState,
    role === "support_crew" ? { token } : "skip",
  );

  const travelerActivity = useQuery(
    tripcastApi.currentActivity.travelerGetCurrentActivity,
    role === "traveler" ? { token } : "skip",
  );
  const crewActivity = useQuery(
    tripcastApi.currentActivity.supportCrewGetCurrentActivity,
    role === "support_crew" ? { token } : "skip",
  );

  const travelerAutoState = useQuery(
    tripcastApi.travelerAutoState.travelerGetAutoState,
    role === "traveler" ? { token } : "skip",
  );
  const crewAutoState = useQuery(
    tripcastApi.travelerAutoState.supportCrewGetAutoState,
    role === "support_crew" ? { token } : "skip",
  );

  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const auto = React.useMemo<NormalizedAuto | null>(() => {
    if (role === "traveler") return normalizeTraveler(travelerAutoState);
    return normalizeCrew(crewAutoState);
  }, [role, travelerAutoState, crewAutoState]);

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
    const crew = crewState as TravelerStateForCrew | null | undefined;
    if (!crew || !crew.visible) return null;
    return {
      energyLevel: crew.energyLevel,
      energyScore: crew.energyScore,
      stomachLevel: crew.stomachLevel,
      stomachScore: crew.stomachScore,
      stressLevel: crew.stressLevel,
      stressScore: crew.stressScore,
      updatedAt: crew.updatedAt,
    };
  }, [role, travelerState, crewState]);

  const activity: CurrentActivity | null = role === "traveler"
    ? (travelerActivity ?? null)
    : (crewActivity ?? null);

  if (
    (role === "traveler" && travelerState === undefined && travelerActivity === undefined) ||
    (role === "support_crew" && crewState === undefined && crewActivity === undefined)
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
  const crewAutoActive = role === "support_crew" && auto != null;
  const crewActivityLabelOverride =
    crewAutoActive && !activity
      ? `AUTO EST. · base saved ${formatBaseSavedAgo(auto!.autoEnabledAt, now)}`
      : null;

  return (
    <div className={className}>
      <StatusCard
        activityLabel={activity ? activity.title : crewActivityLabelOverride ?? null}
        activityEmoji={activity?.emoji ?? null}
        activitySince={activity ? formatElapsed(activity.startedAt, now) : null}
        meters={meters}
        interactive={role === "traveler"}
        onActivate={role === "traveler" ? onOpenState : undefined}
      />
      {crewAutoActive && (isAutoEnergyOn || isAutoStomachOn) ? (
        <p className="mt-1 text-[10px] text-[var(--ink-3)]">
          These values are estimated locally from the Traveler's saved State. They may not reflect a manual update.
        </p>
      ) : null}
    </div>
  );
}

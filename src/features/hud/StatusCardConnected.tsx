import * as React from "react";
import { useQuery } from "convex/react";

import {
  tripcastApi,
  type CurrentActivity,
  type Role,
  type TravelerEnergyLevel,
  type TravelerStateForCrew,
  type TravelerStomachLevel,
  type TravelerStressLevel,
} from "@/convex/tripcastApi";
import {
  computeEffectiveStomachScore,
  ENERGY_SCORE_FOR_LEVEL,
  STOMACH_SCORE_FOR_LEVEL,
  STRESS_SCORE_FOR_LEVEL,
} from "@/features/travelstate/travelerStateUtils";

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

  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

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

  const meters: StatusCardMeter[] = stateFacts
    ? (() => {
        const energyValue = resolveScore(
          stateFacts.energyScore,
          stateFacts.energyLevel,
          ENERGY_SCORE_FOR_LEVEL,
          50,
        );
        const stomachScoreRaw = stateFacts.stomachScore;
        const stomachValue = (() => {
          if (typeof stomachScoreRaw === "number") {
            const decayed =
              typeof stateFacts.updatedAt === "number"
                ? computeEffectiveStomachScore(stomachScoreRaw, stateFacts.updatedAt)
                : stomachScoreRaw;
            return Math.min(150, Math.max(0, decayed));
          }
          return resolveScore(undefined, stateFacts.stomachLevel, STOMACH_SCORE_FOR_LEVEL, 50);
        })();
        const stressValue = resolveScore(
          stateFacts.stressScore,
          stateFacts.stressLevel,
          STRESS_SCORE_FOR_LEVEL,
          50,
        );
        return [
          { label: "Energy", value: energyValue, max: 100 },
          { label: "Stomach", value: stomachValue, max: 150 },
          { label: "Calm", value: Math.max(0, Math.min(100, 100 - stressValue)), max: 100 },
        ];
      })()
    : [];

  return (
    <StatusCard
      activityLabel={activity ? activity.title : null}
      activityEmoji={activity?.emoji ?? null}
      activitySince={activity ? formatElapsed(activity.startedAt, now) : null}
      meters={meters}
      interactive={role === "traveler"}
      onActivate={role === "traveler" ? onOpenState : undefined}
      className={className}
    />
  );
}

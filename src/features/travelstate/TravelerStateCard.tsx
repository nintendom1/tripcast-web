import { useState, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { TravelerStateForCrew } from "../../convex/tripcastApi";
import { StatBar } from "../../components/rpg/StatBar";
import {
  MOOD_LABELS,
  ENERGY_LABELS,
  STOMACH_LABELS,
  STRESS_LABELS,
  SCHEDULE_LABELS,
  getStateEmoji,
  computeEffectiveStomachScore,
  getStomachLevelFromScore,
  formatRelativeTime,
} from "./travelerStateUtils";

type TravelerStateCardProps = {
  token: string;
};

function StatRow({
  label,
  value,
  score,
  maxScore = 100,
  colorClass,
}: {
  label: string;
  value: string | undefined;
  score: number | undefined;
  maxScore?: number;
  colorClass?: string;
}) {
  if (!value && score === undefined) return null;
  const pct = score !== undefined ? Math.round((score / maxScore) * 100) : undefined;
  return (
    <div className="grid gap-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-semibold">
          {value ?? "—"}
          {score !== undefined && (
            <span className="text-muted-foreground font-normal"> · {Math.round(score)}</span>
          )}
        </span>
      </div>
      {pct !== undefined && (
        <StatBar value={pct} label="" colorClass={colorClass ?? "bg-navy"} />
      )}
    </div>
  );
}

export default function TravelerStateCard({ token }: TravelerStateCardProps) {
  const data = useQuery(tripcastApi.travelerState.supportCrewGetTravelerState, { token });
  const [expanded, setExpanded] = useState(true);
  const [now, setNow] = useState(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick every 60s to refresh relative time and stomach decay
  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!data) return null;

  if (!data.visible) {
    return (
      <div className="absolute top-5 left-5 z-[2] rounded-lg border bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-md backdrop-blur-sm">
        Traveler State hidden
      </div>
    );
  }

  const crew = data as Extract<TravelerStateForCrew, { visible: true }>;

  if (crew.updatedAt === null) {
    return (
      <div className="absolute top-5 left-5 z-[2] rounded-lg border bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-md backdrop-blur-sm">
        Traveler State — no update yet
      </div>
    );
  }

  const emoji = getStateEmoji({
    moodValue: crew.moodValue,
    energyLevel: crew.energyLevel,
    stomachLevel: crew.stomachLevel,
  });

  const effectiveStomach =
    crew.stomachScore !== undefined
      ? computeEffectiveStomachScore(crew.stomachScore, crew.updatedAt)
      : undefined;
  const effectiveStomachLevel =
    effectiveStomach !== undefined ? getStomachLevelFromScore(effectiveStomach) : undefined;

  const relTime = formatRelativeTime(crew.updatedAt);

  return (
    <div
      className="absolute top-5 left-5 z-[2] w-64 rounded-lg border bg-background/95 shadow-md backdrop-blur-sm"
      aria-label="Traveler State"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden="true">
            {emoji}
          </span>
          <span className="text-xs font-bold">Traveler State</span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          aria-label={expanded ? "Collapse" : "Expand"}
          className="rounded p-0.5 hover:bg-muted"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="grid gap-2.5 border-t px-3 py-3">
          {crew.moodValue !== undefined && (
            <StatRow
              label="Mood"
              value={MOOD_LABELS[crew.moodValue]}
              score={crew.moodScore}
              colorClass="bg-indigo-500"
            />
          )}

          {crew.energyLevel !== undefined && (
            <StatRow
              label="Energy"
              value={ENERGY_LABELS[crew.energyLevel]}
              score={crew.energyScore}
              colorClass="bg-amber-500"
            />
          )}

          {(effectiveStomachLevel !== undefined || crew.stomachLevel !== undefined) && (
            <StatRow
              label="Stomach"
              value={
                effectiveStomachLevel
                  ? STOMACH_LABELS[effectiveStomachLevel]
                  : crew.stomachLevel
                    ? STOMACH_LABELS[crew.stomachLevel]
                    : undefined
              }
              score={effectiveStomach}
              maxScore={150}
              colorClass="bg-orange-500"
            />
          )}

          {crew.stressLevel !== undefined && (
            <StatRow
              label="Stress"
              value={STRESS_LABELS[crew.stressLevel]}
              score={crew.stressScore}
              colorClass="bg-red-500"
            />
          )}

          {crew.schedulePressureLevel !== undefined && (
            <StatRow
              label="Schedule"
              value={SCHEDULE_LABELS[crew.schedulePressureLevel]}
              score={crew.schedulePressureScore}
              colorClass="bg-sky-500"
            />
          )}

          {crew.statusNote && (
            <p className="text-xs italic text-muted-foreground">
              &ldquo;{crew.statusNote}&rdquo;
            </p>
          )}

          {(crew.biometricSteps !== undefined ||
            crew.biometricAverageHeartRate !== undefined ||
            crew.biometricSleepHours !== undefined ||
            crew.biometricActiveMinutes !== undefined) && (
            <div className="grid gap-1 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
              {crew.biometricSteps !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Steps</span>
                  <span className="font-medium">{crew.biometricSteps.toLocaleString()}</span>
                </div>
              )}
              {crew.biometricAverageHeartRate !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg HR</span>
                  <span className="font-medium">{crew.biometricAverageHeartRate} bpm</span>
                </div>
              )}
              {crew.biometricSleepHours !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sleep</span>
                  <span className="font-medium">{crew.biometricSleepHours}h</span>
                </div>
              )}
              {crew.biometricActiveMinutes !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Active</span>
                  <span className="font-medium">{crew.biometricActiveMinutes} min</span>
                </div>
              )}
            </div>
          )}

          <p className="text-right text-xs text-muted-foreground" suppressHydrationWarning>
            Updated {relTime}
          </p>
        </div>
      )}

      {!expanded && (
        <p className="border-t px-3 py-1.5 text-right text-xs text-muted-foreground">
          {relTime}
        </p>
      )}
    </div>
  );
}

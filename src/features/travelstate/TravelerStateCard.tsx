import React, { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
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
  role: "traveler" | "support_crew";
};

// Two-segment bar: orange fills 0-100, amber-dark extends 100-150 beyond the marker
function StomachBar({ score }: { score: number }) {
  const markerPct = (100 / 150) * 100; // ~66.7%
  const totalFillPct = (score / 150) * 100;
  const normalFillPct = Math.min(totalFillPct, markerPct);
  const overflowFillPct = Math.max(0, totalFillPct - markerPct);
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="absolute inset-y-0 left-0 bg-orange-500"
        style={{ width: `${normalFillPct}%` }}
      />
      {overflowFillPct > 0 && (
        <div
          className="absolute inset-y-0 bg-amber-700"
          style={{ left: `${markerPct}%`, width: `${overflowFillPct}%` }}
        />
      )}
      {/* Divider at score=100 */}
      <div
        className="absolute inset-y-0 w-px bg-background/60"
        style={{ left: `${markerPct}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared layout helpers
// ---------------------------------------------------------------------------

function StatRow({
  label,
  value,
  score,
  maxScore = 100,
  colorClass,
  chipOnly,
  customBar,
}: {
  label: string;
  value: string | undefined;
  score: number | undefined;
  maxScore?: number;
  colorClass?: string;
  chipOnly?: boolean;
  customBar?: React.ReactNode;
}) {
  if (!value && score === undefined) return null;
  const pct = score !== undefined ? Math.round((score / maxScore) * 100) : undefined;
  if (chipOnly) {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{value ?? "—"}</span>
      </div>
    );
  }
  return (
    <div className="grid gap-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-semibold">{value ?? "—"}</span>
      </div>
      {customBar ?? (pct !== undefined && (
        <StatBar value={pct} label="" colorClass={colorClass ?? "bg-navy"} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Support Crew card — queries supportCrewGetTravelerState
// ---------------------------------------------------------------------------

function SupportCrewCard({ token }: { token: string }) {
  const data = useQuery(tripcastApi.travelerState.supportCrewGetTravelerState, { token });
  const [expanded, setExpanded] = useState(true);
  const [now, setNow] = useState(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Feedback #1: return null when hidden
  if (!data || !data.visible) return null;

  const crew = data as Extract<TravelerStateForCrew, { visible: true }>;

  if (crew.updatedAt === null) return null;

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
  // suppress unused warning
  void now;

  return (
    <CardShell
      emoji={emoji}
      relTime={relTime}
      expanded={expanded}
      onToggle={() => setExpanded((p) => !p)}
    >
      {crew.moodValue !== undefined && (
        <StatRow
          label="Mood"
          value={MOOD_LABELS[crew.moodValue]}
          score={undefined}
          chipOnly
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
          customBar={effectiveStomach !== undefined ? <StomachBar score={effectiveStomach} /> : undefined}
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
          score={undefined}
          chipOnly
        />
      )}

      {crew.statusNote && (
        <p className="text-xs italic text-muted-foreground">&ldquo;{crew.statusNote}&rdquo;</p>
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
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Traveler card — queries travelerGetState, shows own data + Clear button (#10)
// ---------------------------------------------------------------------------

function TravelerCard({ token }: { token: string }) {
  const data = useQuery(tripcastApi.travelerState.travelerGetState, { token });
  const deleteTravelerState = useMutation(tripcastApi.privacy.deleteTravelerState);
  const [expanded, setExpanded] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [clearing, setClearing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  void now;

  if (!data || !data.state) return null;

  const { state } = data;
  const updatedAt = state.updatedAt;

  const emoji = getStateEmoji({
    moodValue: state.moodValue,
    energyLevel: state.energyLevel,
    stomachLevel: state.stomachLevel,
  });

  const effectiveStomach =
    state.stomachScore !== undefined
      ? computeEffectiveStomachScore(state.stomachScore, updatedAt)
      : undefined;
  const effectiveStomachLevel =
    effectiveStomach !== undefined ? getStomachLevelFromScore(effectiveStomach) : undefined;

  const relTime = formatRelativeTime(updatedAt);

  async function handleClear() {
    if (clearing) return;
    setClearing(true);
    try {
      await deleteTravelerState({ token });
    } finally {
      setClearing(false);
    }
  }

  return (
    <CardShell
      emoji={emoji}
      relTime={relTime}
      expanded={expanded}
      onToggle={() => setExpanded((p) => !p)}
    >
      {state.moodValue !== undefined && (
        <StatRow
          label="Mood"
          value={MOOD_LABELS[state.moodValue]}
          score={undefined}
          chipOnly
        />
      )}

      {state.energyLevel !== undefined && (
        <StatRow
          label="Energy"
          value={ENERGY_LABELS[state.energyLevel]}
          score={state.energyScore}
          colorClass="bg-amber-500"
        />
      )}

      {(effectiveStomachLevel !== undefined || state.stomachLevel !== undefined) && (
        <StatRow
          label="Stomach"
          value={
            effectiveStomachLevel
              ? STOMACH_LABELS[effectiveStomachLevel]
              : state.stomachLevel
                ? STOMACH_LABELS[state.stomachLevel]
                : undefined
          }
          score={effectiveStomach}
          maxScore={150}
          customBar={effectiveStomach !== undefined ? <StomachBar score={effectiveStomach} /> : undefined}
        />
      )}

      {state.stressLevel !== undefined && (
        <StatRow
          label="Stress"
          value={STRESS_LABELS[state.stressLevel]}
          score={state.stressScore}
          colorClass="bg-red-500"
        />
      )}

      {state.schedulePressureLevel !== undefined && (
        <StatRow
          label="Schedule"
          value={SCHEDULE_LABELS[state.schedulePressureLevel]}
          score={undefined}
          chipOnly
        />
      )}

      {state.statusNote && (
        <p className="text-xs italic text-muted-foreground">&ldquo;{state.statusNote}&rdquo;</p>
      )}
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Shared shell — compact header (#2) with emoji + "State" + time + collapse
// ---------------------------------------------------------------------------

function CardShell({
  emoji,
  relTime,
  expanded,
  onToggle,
  children,
}: {
  emoji: string;
  relTime: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute top-5 left-5 z-[2] w-56 rounded-lg border bg-background/95 shadow-md backdrop-blur-sm"
      aria-label="Traveler State"
    >
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-base" aria-hidden="true">
            {emoji}
          </span>
          <span className="text-xs font-bold">State</span>
          <span className="text-xs text-muted-foreground" suppressHydrationWarning>
            · {relTime}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? "Collapse" : "Expand"}
          className="rounded p-0.5 hover:bg-muted"
        >
          {expanded ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="grid gap-2 border-t px-2.5 py-2">{children}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component — dispatches by role
// ---------------------------------------------------------------------------

export default function TravelerStateCard({ token, role }: TravelerStateCardProps) {
  if (role === "traveler") return <TravelerCard token={token} />;
  return <SupportCrewCard token={token} />;
}

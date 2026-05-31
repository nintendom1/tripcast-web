import { Clock, Eye, MapPin, RadioTower, Ticket } from "lucide-react";

import type { MysteryMissionFeedItem } from "../../convex/tripcastApi";
import { cn } from "@/lib/utils";
import CrypticText from "./CrypticText";

type Props = {
  mission: MysteryMissionFeedItem;
  isHighlighted?: boolean;
  onClick?: () => void;
};

function stateLabel(state: MysteryMissionFeedItem["state"]) {
  if (state === "revealed") return "Revealed";
  if (state === "dismissed") return "Dismissed";
  return "Signal";
}

export default function MysteryMissionCard({ mission, isHighlighted, onClick }: Props) {
  const revealed = mission.state === "revealed";

  return (
    <button
      type="button"
      data-mission-id={mission._id}
      data-mystery-mission-id={mission._id}
      className={cn(
        "group relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border p-3 pr-10 text-left shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5",
        "border-zinc-500/40 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--bg-card)_84%,#111_16%),var(--bg-card))]",
        isHighlighted && "ring-2 ring-zinc-500",
      )}
      onClick={onClick}
    >
      {mission.state === "signal" ? (
        <span className="pointer-events-none absolute inset-0 opacity-50" aria-hidden="true">
          <span className="mystery-card-fizzle mystery-card-fizzle-a" />
          <span className="mystery-card-fizzle mystery-card-fizzle-b" />
          <span className="mystery-card-fizzle mystery-card-fizzle-c" />
        </span>
      ) : null}

      <span
        className="relative mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-zinc-400/50 bg-zinc-900 text-zinc-100"
        aria-hidden="true"
      >
        <RadioTower className="h-[18px] w-[18px]" />
      </span>

      <span className="relative flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0 font-[var(--font-display)] text-sm font-extrabold leading-snug text-[var(--ink-1)] line-clamp-2">
            {revealed ? mission.trueIntent ?? mission.mysteryText : <CrypticText text={mission.mysteryText} />}
          </span>
          <span className="max-w-[48%] shrink-0 truncate rounded-full border border-zinc-500/50 bg-zinc-950 px-2 py-0.5 font-[var(--font-mono)] text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-100 whitespace-nowrap">
            {stateLabel(mission.state)}
          </span>
        </span>

        {revealed ? (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-100">
            <Eye className="h-2.5 w-2.5" aria-hidden="true" />
            True intent revealed
          </span>
        ) : (
          <span className="text-xs leading-snug text-[var(--ink-3)] line-clamp-1">
            Corrupted travel signal
          </span>
        )}

        <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--ink-3)]">
          {mission.region ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" /> {mission.region}
            </span>
          ) : null}
          {revealed && mission.locationName ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" /> {mission.locationName}
            </span>
          ) : null}
          {mission.estimatedVisitMinutes ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" /> {mission.estimatedVisitMinutes} min
            </span>
          ) : null}
          {mission.requiresTicket ? (
            <span className="inline-flex items-center gap-1">
              <Ticket className="h-3 w-3" aria-hidden="true" /> Ticket
            </span>
          ) : null}
          {mission.distanceMiles !== undefined && mission.state === "signal" ? (
            <span>{mission.distanceMiles.toFixed(1)} mi away</span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

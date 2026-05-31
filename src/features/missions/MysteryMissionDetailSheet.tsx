import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Eye, MapPin, RadioTower, XCircle } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { MysteryMissionFeedItem, Role } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import { useDebugLogger } from "../../debug/useDebugLogger";
import CrypticText from "./CrypticText";

type Props = {
  mission: MysteryMissionFeedItem | null;
  token: string;
  role: Role;
  onClose: () => void;
  onCompleteAsStory?: (mission: MysteryMissionFeedItem) => void;
  onViewOnMap?: () => void;
  debugSource?: { source: string; sourceLabel: string };
};

function friendlyError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function MysteryMissionDetailSheet({
  mission,
  token,
  role,
  onClose,
  onCompleteAsStory,
  onViewOnMap,
  debugSource,
}: Props) {
  const log = useDebugLogger(
    "MysteryMissionDetailSheet",
    "src/features/missions/MysteryMissionDetailSheet.tsx",
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmNoStory, setConfirmNoStory] = useState(false);
  const complete = useMutation(tripcastApi.mysteryMissions.travelerCompleteMysteryMission);
  const dismiss = useMutation(tripcastApi.mysteryMissions.travelerDismissMysteryMission);
  const liveMission = useQuery(
    tripcastApi.mysteryMissions.getMysteryMission,
    mission ? { token, mysteryMissionId: mission._id } : "skip",
  );
  const current = liveMission ?? mission;

  useActiveUiContext(Boolean(current), {
    sheetName: "MysteryMissionDetailSheet",
    label: "Mystery Mission detail",
    view: current?.state ?? "detail",
    source: debugSource?.source ?? "unknown",
    sourceLabel: debugSource?.sourceLabel ?? "Unknown",
    file: "src/features/missions/MysteryMissionDetailSheet.tsx",
  }, { boundsSelector: "[data-role='missions-sheet']" });

  if (!current) return null;

  const isTraveler = role === "traveler";
  const revealed = current.state === "revealed";

  async function handleCompleteNoStory() {
    if (!current || working) return;
    setWorking(true);
    setError(null);
    log.logUi("action:mystery-complete-no-story", { mysteryMissionId: current._id });
    try {
      await complete({ token, mysteryMissionId: current._id });
      setConfirmNoStory(false);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setWorking(false);
    }
  }

  async function handleDismiss() {
    if (!current || working) return;
    setWorking(true);
    setError(null);
    log.logUi("action:mystery-dismiss", { mysteryMissionId: current._id });
    try {
      await dismiss({ token, mysteryMissionId: current._id });
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mystery-detail flex flex-col gap-4 p-4 pt-0">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-500/50 bg-zinc-950 px-3 py-1 font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-100">
          <RadioTower className="h-3.5 w-3.5" aria-hidden="true" />
          {revealed ? "Revealed" : "Unknown Signal"}
        </span>
        {onViewOnMap ? (
          <button
            type="button"
            className="text-xs text-[var(--ink-3)] underline hover:text-[var(--ink-1)]"
            onClick={onViewOnMap}
          >
            View on map
          </button>
        ) : null}
      </div>

      <section className="grid gap-2 rounded-2xl border border-zinc-500/40 bg-zinc-950 p-4 text-zinc-100 shadow-[var(--shadow-card)]">
        <p className="font-[var(--font-display)] text-xl font-extrabold leading-tight">
          <CrypticText text={current.mysteryText} />
        </p>
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">
          Blackbox itinerary fragment
        </p>
      </section>

      {revealed ? (
        <section className="grid gap-2 rounded-xl border border-zinc-500/40 bg-[var(--bg-card)] p-3">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            True Intent Revealed
          </p>
          <p className="text-sm leading-relaxed text-[var(--ink-1)]">{current.trueIntent}</p>
        </section>
      ) : null}

      <section className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--ink-3)]">
        {current.region ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {current.region}
          </span>
        ) : null}
        {revealed && current.locationName ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {current.locationName}
          </span>
        ) : null}
        {current.tags?.slice(0, 4).map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </section>

      {error ? <p className="text-sm text-[var(--ink-danger)]" role="alert">{error}</p> : null}

      {isTraveler && current.state === "signal" ? (
        <section className="grid gap-2 border-t border-[var(--line-soft)] pt-3">
          {onCompleteAsStory ? (
            <Button
              type="button"
              size="sm"
              disabled={working}
              onClick={() => {
                log.logUi("action:mystery-complete-story", { mysteryMissionId: current._id });
                onCompleteAsStory(current);
              }}
              className="border-zinc-900 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
            >
              Complete as story
            </Button>
          ) : null}

          {confirmNoStory ? (
            <div className="grid gap-2 rounded-xl border border-zinc-500/40 bg-[var(--bg-card)] p-3">
              <p className="text-sm text-[var(--ink-2)]">
                Reveal the true intent without creating a Story?
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmNoStory(false)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" disabled={working} onClick={handleCompleteNoStory}>
                  {working ? "Revealing..." : "Reveal"}
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" size="sm" variant="outline" disabled={working} onClick={() => setConfirmNoStory(true)}>
              Complete without story
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={working}
            onClick={handleDismiss}
            className="border-zinc-500/50 text-[var(--ink-3)]"
          >
            <XCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Dismiss signal
          </Button>
        </section>
      ) : null}
    </div>
  );
}

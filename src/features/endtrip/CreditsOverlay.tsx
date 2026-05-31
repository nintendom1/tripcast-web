import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { useQuery } from "convex/react";
import { Archive, X } from "lucide-react";

import { tripcastApi, type Role } from "../../convex/tripcastApi";
import { useDebugLogger } from "../../debug/useDebugLogger";

type Props = {
  token: string;
  role: Role;
  onClose: () => void;
};

function CreditRow({ role, names }: { role: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">{role}</div>
      <div className="mt-1 font-[var(--font-display)] text-base font-semibold text-white">
        {names.join(" · ")}
      </div>
    </div>
  );
}

/**
 * Full-screen game-finale credits. Loops a vertical scroll through the trip's
 * people, leaderboard, badges, and the Traveler's thank-you note. The app is
 * never locked — this is purely an overlay the user can dismiss any time.
 */
export default function CreditsOverlay({ token, role, onClose }: Props) {
  const credits = useQuery(tripcastApi.endTrip.getTripCredits, { token });
  const queriedEvents = useQuery(tripcastApi.journalEvents.listJournalEvents, { token });
  const queriedMissions = useQuery(
    role === "traveler"
      ? tripcastApi.missions.travelerListMissions
      : tripcastApi.missions.followerListMissions,
    { token },
  );
  const followerPreferences = useQuery(
    tripcastApi.travelerPreferences.followerGetPreferences,
    role === "follower" ? { token } : "skip",
  );
  const log = useDebugLogger("CreditsOverlay", "src/features/endtrip/CreditsOverlay.tsx");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.logUi("finale:open");
    return () => log.logUi("finale:close");
  }, [log]);

  useEffect(() => {
    if (!credits || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    log.logUi("credits:rendered", {
      ended: credits.ended,
      followers: credits.totals.followers,
      points: credits.totals.points,
      badges: credits.totals.badges,
      dims: { width: Math.round(rect.width), height: Math.round(rect.height) },
      viewport: { w: window.innerWidth, h: window.innerHeight },
    });
    log.logUi("finale:credits-view", {
      followers: credits.totals.followers,
      points: credits.totals.points,
      badges: credits.totals.badges,
    });
  }, [credits, log]);

  const leaderboard = credits?.leaderboard ?? [];
  const stats = useMemo(() => {
    const cutoffAt = followerPreferences?.visible
      ? (followerPreferences as any).followerContentCutoffAt
      : undefined;

    const events = (queriedEvents ?? []).filter((e) => {
      if (role === "traveler" || !cutoffAt) return true;
      return e.occurredAt >= cutoffAt;
    });

    const missions = (queriedMissions ?? []).filter((m) => {
      if (role === "traveler" || !cutoffAt) return true;
      return (m as any).occurredAt ? (m as any).occurredAt >= cutoffAt : true;
    });

    const storyCount = events.filter((event) => event.type === "story").length;
    const routeSteps = events.filter((event) => event.lat !== undefined && event.lon !== undefined).length;
    const completedMissions = missions.filter((mission) => mission.status === "completed").length;
    const first = events.at(-1);
    const last = events[0];
    const durationDays =
      first && last
        ? Math.max(1, Math.ceil((last.occurredAt - first.occurredAt) / 86_400_000))
        : 0;
    return { storyCount, routeSteps, completedMissions, durationDays };
  }, [queriedEvents, queriedMissions]);
  const topByBadges = [...leaderboard]
    .filter((e) => e.badges > 0)
    .sort((a, b) => b.badges - a.badges)
    .slice(0, 3)
    .map((e) => `${e.name} · ${e.badges}`);
  const topByPoints = leaderboard
    .slice(0, 3)
    .map((e, i) => `${i + 1}. ${e.name} · ${e.points}`);

  useEffect(() => {
    if (stats.routeSteps === 0) return;
    log.logUi("finale:route-replay-step", { routeSteps: stats.routeSteps });
  }, [log, stats.routeSteps]);

  function handleClose() {
    log.logUi("finale:archive-navigation", {
      destination: "map-archive",
      ended: credits?.ended ?? false,
    });
    onClose();
  }

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-[2000] overflow-hidden bg-black/45"
      role="dialog"
      aria-label="Trip Complete"
    >
      <div className="pointer-events-none absolute -left-10 -top-16 h-44 w-44 rotate-12 border border-white/18 bg-black/15" />
      <div className="pointer-events-none absolute -bottom-16 -right-10 h-52 w-52 rotate-12 border border-white/18 bg-black/15" />

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
        <div>
          <div className="font-[var(--meadow-font-display)] text-[10px] uppercase tracking-[0.18em] text-white/50">
            {credits?.ended ? "Trip Complete" : "Finale preview"}
          </div>
          <div className="font-[var(--font-display)] text-lg font-extrabold text-white">TripCast finale</div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close to map archive"
          className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <motion.div
        className="pointer-events-none absolute inset-y-6 left-[-18vw] right-[-18vw] rotate-[-8deg] bg-[linear-gradient(135deg,rgba(255,139,74,0.94),rgba(28,31,58,0.96))] shadow-[0_30px_90px_rgba(0,0,0,0.45)]"
        initial={{ x: "-110%" }}
        animate={{ x: 0 }}
        transition={{ duration: 0.75, ease: [0.22, 0.9, 0.3, 1] }}
      />

      <div
        className="absolute inset-x-0 bottom-8 top-16 overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0%, #000 12%, #000 80%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, #000 12%, #000 80%, transparent 100%)",
        }}
      >
        <motion.div
          className="px-8 text-center"
          initial={{ y: "100%" }}
          animate={{ y: "-100%" }}
          transition={{ duration: 22, ease: "linear", repeat: Infinity }}
        >
          <div className="py-10" />
          <div className="mb-10">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/60">Trip Complete</div>
            <h1 className="mt-2 font-[var(--font-display)] text-4xl font-black text-white">
              The route made it.
            </h1>
          </div>
          {credits?.thankYouNote ? (
            <div className="mb-10">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">
                A note from the Traveler
              </div>
              <p className="mx-auto mt-3 max-w-[300px] text-lg italic leading-relaxed text-white">
                “{credits.thankYouNote}”
              </p>
            </div>
          ) : null}

          <CreditRow role="Traveler" names={[credits?.travelerName ?? "The Traveler"]} />
          <CreditRow role="Followers" names={credits?.followers ?? []} />
          <CreditRow role="Leaderboard" names={topByPoints} />
          <CreditRow role="Most badges" names={topByBadges} />

          <div className="mt-10 text-[10px] uppercase tracking-[0.3em] text-white/50">
            By the numbers
          </div>
          <div className="mt-2 text-sm text-white/80">
            {stats.storyCount} Stories · {stats.completedMissions} completed Missions · {stats.routeSteps} mapped stops
          </div>
          <div className="mt-1 text-sm text-white/80">
            {credits?.totals.points ?? 0} points · {credits?.totals.badges ?? 0} badges ·{" "}
            {credits?.totals.followers ?? 0} followers · {stats.durationDays} days
          </div>

          <div className="mt-12 text-[10px] uppercase tracking-[0.3em] text-white/50">
            Cartography
          </div>
          <div className="mt-2 text-sm text-white/80">
            Maps by OpenFreeMap · Data © OpenStreetMap contributors
          </div>
          <div className="mt-1 text-xs text-white/60">Rendered with MapLibre GL</div>

          <div className="mt-12 font-[var(--font-display)] text-base font-extrabold text-white">
            TripCast
          </div>
          <div className="flex justify-center py-10">
            <button
              type="button"
              onClick={handleClose}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white/14 px-4 py-2 text-xs font-semibold text-white hover:bg-white/24"
            >
              <Archive className="h-4 w-4" />
              Map archive
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

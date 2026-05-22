import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useQuery } from "convex/react";
import { X } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import { useDebugLogger } from "../../debug/useDebugLogger";

type Props = {
  token: string;
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
export default function CreditsOverlay({ token, onClose }: Props) {
  const credits = useQuery(tripcastApi.endTrip.getTripCredits, { token });
  const log = useDebugLogger("CreditsOverlay", "src/features/endtrip/CreditsOverlay.tsx");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.logUi("credits:open");
    return () => log.logUi("credits:close");
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
  }, [credits, log]);

  const leaderboard = credits?.leaderboard ?? [];
  const topByBadges = [...leaderboard]
    .filter((e) => e.badges > 0)
    .sort((a, b) => b.badges - a.badges)
    .slice(0, 3)
    .map((e) => `${e.name} · ${e.badges}`);
  const topByPoints = leaderboard
    .slice(0, 3)
    .map((e, i) => `${i + 1}. ${e.name} · ${e.points}`);

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-[2000] overflow-hidden bg-[var(--bg-ink)]"
      role="dialog"
      aria-label="Trip credits"
    >
      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
        <div>
          <div className="font-[var(--meadow-font-display)] text-[10px] uppercase tracking-[0.18em] text-white/50">
            {credits?.ended ? "The trip ended" : "Trip credits"}
          </div>
          <div className="font-[var(--font-display)] text-lg font-extrabold text-white">TripCast</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close credits"
          className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Looping scroll */}
      <div
        className="absolute inset-x-0 bottom-0 top-16 overflow-hidden"
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
            {credits?.totals.points ?? 0} points · {credits?.totals.badges ?? 0} badges ·{" "}
            {credits?.totals.followers ?? 0} followers
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
          <div className="py-10 text-[11px] text-white/50">
            The reel loops · tap × to close
          </div>
        </motion.div>
      </div>
    </div>
  );
}

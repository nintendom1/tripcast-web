import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { tripcastApi } from "../../convex/tripcastApi";

type RouteVoteButtonProps = {
  token: string;
  onClick: () => void;
};

export default function RouteVoteButton({ token, onClick }: RouteVoteButtonProps) {
  const alert = useQuery(tripcastApi.routeVotes.getActiveRouteVoteAlert, { token });
  const hasUnseen = alert?.hasUnseen ?? false;

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-[70px] right-5 z-[2] flex items-center gap-2 min-h-11 px-4 bg-white border border-slate-300 rounded-md shadow-lg text-navy font-bold text-sm hover:bg-slate-50 transition-colors"
      aria-label={hasUnseen ? "Vote — party awaits!" : "View votes"}
    >
      {hasUnseen ? (
        <>
          <motion.span
            animate={{ opacity: [1, 0.2, 1], scale: [1, 1.15, 1] }}
            transition={{ repeat: Infinity, duration: 1, ease: "easeInOut" }}
            className="inline-block w-2 h-2 rounded-full bg-crimson"
            aria-hidden
          />
          The party awaits!
        </>
      ) : (
        "Votes"
      )}
    </button>
  );
}

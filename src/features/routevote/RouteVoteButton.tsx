import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Vote } from "lucide-react";
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
      aria-label={hasUnseen ? "Vote open — join in!" : "View route votes"}
      className="relative w-11 h-11 flex items-center justify-center bg-white border border-slate-300 rounded-md shadow-lg text-navy hover:bg-slate-50 transition-colors"
    >
      <Vote className="h-5 w-5" aria-hidden />
      {hasUnseen && (
        <motion.span
          animate={{ opacity: [1, 0.3, 1], scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1, ease: "easeInOut" }}
          className="absolute top-0.5 right-0.5 inline-block w-2.5 h-2.5 rounded-full bg-crimson"
          aria-hidden
        />
      )}
    </button>
  );
}

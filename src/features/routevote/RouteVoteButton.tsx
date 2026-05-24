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
      className="relative flex h-11 w-11 items-center justify-center rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] text-[var(--ink-1)] shadow-lg transition-colors hover:bg-[var(--meter-track)]"
    >
      <Vote className="h-5 w-5" aria-hidden />
      {hasUnseen && (
        <motion.span
          animate={{ opacity: [1, 0.3, 1], scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1, ease: "easeInOut" }}
          className="absolute right-0.5 top-0.5 inline-block h-2.5 w-2.5 rounded-full bg-[var(--danger)]"
          aria-hidden
        />
      )}
    </button>
  );
}

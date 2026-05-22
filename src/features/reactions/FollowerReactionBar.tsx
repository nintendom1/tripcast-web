import { useState } from "react";
import { useMutation } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { cn } from "@/lib/utils";

// Kept in sync with the backend REACTION_EMOJIS allowlist (convex/reactions.ts).
export const REACTION_EMOJIS = ["❤️", "🔥", "😂", "👏", "😮", "🙌", "🎉", "🥹"] as const;

type Props = {
  token: string;
  className?: string;
};

/**
 * Compact emoji bar shown to the Follower so they can react to the Traveler's
 * current activity/state. Submissions are rate-limited and validated server-side.
 */
export default function FollowerReactionBar({ token, className }: Props) {
  const submit = useMutation(tripcastApi.reactions.followerSubmitReaction);
  const music = useMusicSafe();
  const log = useDebugLogger("FollowerReactionBar", "src/features/reactions/FollowerReactionBar.tsx");
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState<string | null>(null);

  async function handleReact(emoji: string) {
    if (sending) return;
    setSending(true);
    log.logUi("reaction:submit", { emoji, targetKind: "activity" });
    try {
      await submit({ token, emoji, targetKind: "activity" });
      music.sfx("tap");
      setJustSent(emoji);
      window.setTimeout(() => setJustSent(null), 1200);
      log.logMutation("reaction:submit:success", { emoji });
    } catch (e) {
      log.error("reaction:submit:error", "mutation", {
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      role="group"
      aria-label="React to the Traveler"
      className={cn(
        "pointer-events-auto inline-flex items-center gap-0.5 rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] px-2 py-1 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={`React ${emoji}`}
          disabled={sending}
          onClick={() => handleReact(emoji)}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-full text-lg transition-transform hover:bg-[var(--meter-track)] active:scale-90",
            justSent === emoji && "scale-125",
          )}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

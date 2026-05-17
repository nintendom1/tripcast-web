import * as React from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

import { useMusicSafe } from "@/providers/MusicProvider";

export interface MusicMuteIndicatorProps {
  className?: string;
}

/**
 * Tiny corner toggle for the generative soundtrack.
 *
 * Audio engine itself is a stub in Part 1; Part 11 fills in the Web Audio
 * implementation. This indicator only needs to expose the mute state so the
 * Trail design can ship visually now without waiting on the engine.
 */
export function MusicMuteIndicator({ className }: MusicMuteIndicatorProps) {
  const { mute, setMute } = useMusicSafe();
  return (
    <button
      type="button"
      onClick={() => setMute(!mute)}
      aria-pressed={!mute}
      aria-label={mute ? "Unmute soundtrack" : "Mute soundtrack"}
      title={mute ? "Soundtrack muted" : "Soundtrack playing"}
      className={cn(
        "flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full bg-[var(--bg-card)] px-3 text-[var(--ink-2)] shadow-[var(--shadow-card)] transition-colors hover:text-[var(--ink-1)]",
        className,
      )}
    >
      {mute ? (
        <VolumeX className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Volume2 className="h-4 w-4" aria-hidden="true" />
      )}
      <span className="text-[11px] font-semibold leading-none">{mute ? "Muted" : "Sound"}</span>
    </button>
  );
}

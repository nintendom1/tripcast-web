import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";

import { Button } from "../../components/ui/button";
import {
  controlNativeMysteryNarration,
  getNativeMysteryNarrationPlaybackState,
} from "../../native/locationWatcher";
import type { NativeMysteryNarrationPlaybackState } from "../../native/nativeLocationManager";

type Props = {
  missionId: string;
  narration: string;
};

const IDLE_STATE: NativeMysteryNarrationPlaybackState = {
  state: "idle",
  missionId: null,
  source: null,
  characterOffset: 0,
  characterLength: 0,
  totalCharacters: 0,
};

export default function MysteryNarrationPlayer({ missionId, narration }: Props) {
  const [playback, setPlayback] = useState(IDLE_STATE);
  const [working, setWorking] = useState(false);
  const isCurrentMission = playback.missionId === missionId;
  const isPlaying = isCurrentMission && playback.state === "playing";
  const progress = isCurrentMission && playback.totalCharacters > 0
    ? Math.min(100, ((playback.characterOffset + playback.characterLength) / playback.totalCharacters) * 100)
    : 0;

  useEffect(() => {
    let cancelled = false;
    void getNativeMysteryNarrationPlaybackState().then((state) => {
      if (!cancelled && state) setPlayback(state);
    });
    function handlePlayback(event: Event) {
      const detail = (event as CustomEvent<NativeMysteryNarrationPlaybackState>).detail;
      if (detail) setPlayback(detail);
    }
    window.addEventListener("tripcast:mystery-native-playback-state", handlePlayback);
    return () => {
      cancelled = true;
      window.removeEventListener("tripcast:mystery-native-playback-state", handlePlayback);
    };
  }, []);

  async function control(action: "play" | "pause" | "restart") {
    setWorking(true);
    try {
      const next = await controlNativeMysteryNarration({
        action,
        missionId,
        ...(action === "pause" ? {} : { narration }),
      });
      if (next) setPlayback(next);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-xl border border-zinc-500/40 bg-[var(--bg-card)] p-3">
      <div className="grid gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-2)]">
          Mystery narration
        </p>
        <p className="text-xs text-[var(--ink-3)]">
          Traveler-only audio. Followers do not see these controls.
        </p>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-zinc-700"
        role="progressbar"
        aria-label="Narration progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div className="h-full rounded-full bg-zinc-100 transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={working}
          onClick={() => void control(isPlaying ? "pause" : "play")}
        >
          {isPlaying ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
          {isPlaying ? "Pause" : isCurrentMission && playback.state === "paused" ? "Resume" : "Play"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={working} onClick={() => void control("restart")}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Restart
        </Button>
      </div>
    </section>
  );
}

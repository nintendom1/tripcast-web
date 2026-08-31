import { useEffect, useState } from "react";

import { getNativeMysteryNarrationPlaybackState } from "./locationWatcher";
import type { NativeMysteryNarrationPlaybackState } from "./nativeLocationManager";

const IDLE_PLAYBACK: NativeMysteryNarrationPlaybackState = {
  state: "idle",
  missionId: null,
  source: null,
  characterOffset: 0,
  characterLength: 0,
  totalCharacters: 0,
};

export function useNativeMysteryNarrationPlayback(): NativeMysteryNarrationPlaybackState {
  const [playback, setPlayback] = useState(IDLE_PLAYBACK);

  useEffect(() => {
    let cancelled = false;
    let receivedEvent = false;

    function handlePlayback(event: Event) {
      const detail = (event as CustomEvent<NativeMysteryNarrationPlaybackState>).detail;
      if (!detail) return;
      receivedEvent = true;
      setPlayback(detail);
    }

    window.addEventListener("tripcast:mystery-native-playback-state", handlePlayback);
    void getNativeMysteryNarrationPlaybackState().then((state) => {
      if (!cancelled && !receivedEvent && state) setPlayback(state);
    });

    return () => {
      cancelled = true;
      window.removeEventListener("tripcast:mystery-native-playback-state", handlePlayback);
    };
  }, []);

  return playback;
}

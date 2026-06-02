import * as React from "react";
import {
  createAudioEngine,
  type AudioEngine,
  type AudioScenario,
  type AudioSoundtrack,
  type SfxName,
} from "@/lib/audio/engine";
import { isPatchSoundtrack, type PatchSoundtrackId } from "@/lib/audio/patches";

const MUTE_KEY = "tripcast.audio.muted";
const VOLUME_KEY = "tripcast.audio.volume";
const SOUNDTRACK_KEY = "tripcast.audio.soundtrack";

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === "true";
  } catch {
    return fallback;
  }
}

function readNumber(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function readSoundtrack(): AudioSoundtrack {
  try {
    const raw = window.localStorage.getItem(SOUNDTRACK_KEY);
    if (raw === "auto" || (raw && isPatchSoundtrack(raw))) {
      return raw as AudioSoundtrack;
    }
    // Stale phase-1 / pre-phase-1 values (e.g. "happy", "song1") fall through to auto.
    return "auto";
  } catch {
    return "auto";
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage may be unavailable (private mode, quota). Ignore — audio prefs are non-critical.
  }
}

export interface MusicContextValue {
  mute: boolean;
  setMute: (mute: boolean) => void;
  volume: number;
  setVolume: (volume: number) => void;
  soundtrack: AudioSoundtrack;
  setSoundtrack: (soundtrack: AudioSoundtrack) => void;
  setScenario: (scenario: AudioScenario) => void;
  setOverride: (name: string, songId: PatchSoundtrackId | null) => void;
  setSuppressed: (reason: string, active: boolean) => void;
  nowPlaying: PatchSoundtrackId | null;
  sfx: (name: SfxName) => void;
}

export const MusicContext = React.createContext<MusicContextValue | null>(null);

export interface MusicProviderProps {
  children: React.ReactNode;
  engine?: AudioEngine;
}

export function MusicProvider({ children, engine: providedEngine }: MusicProviderProps) {
  const engineRef = React.useRef<AudioEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = providedEngine ?? createAudioEngine();
  }
  const engine = engineRef.current;

  const [mute, setMuteState] = React.useState<boolean>(() => readBool(MUTE_KEY, false));
  const [volume, setVolumeState] = React.useState<number>(() => readNumber(VOLUME_KEY, 0.3));
  const [soundtrack, setSoundtrackState] = React.useState<AudioSoundtrack>(() => readSoundtrack());
  const [nowPlaying, setNowPlaying] = React.useState<PatchSoundtrackId | null>(() =>
    engine.getResolution(),
  );

  React.useEffect(() => {
    engine.armOnGesture();
    const unsub = engine.onResolutionChange((resolved) => {
      setNowPlaying(resolved);
    });
    setNowPlaying(engine.getResolution());
    return unsub;
  }, [engine]);

  React.useEffect(() => {
    engine.setMute(mute);
  }, [engine, mute]);

  React.useEffect(() => {
    engine.setVolume(volume);
  }, [engine, volume]);

  React.useEffect(() => {
    engine.setSoundtrack(soundtrack);
  }, [engine, soundtrack]);

  const setMute = React.useCallback((next: boolean) => {
    setMuteState(next);
    writeStorage(MUTE_KEY, String(next));
  }, []);

  const setVolume = React.useCallback((next: number) => {
    const clamped = Math.min(1, Math.max(0, next));
    setVolumeState(clamped);
    writeStorage(VOLUME_KEY, String(clamped));
  }, []);

  const setSoundtrack = React.useCallback((next: AudioSoundtrack) => {
    setSoundtrackState(next);
    writeStorage(SOUNDTRACK_KEY, next);
  }, []);

  const setScenario = React.useCallback(
    (scenario: AudioScenario) => {
      engine.setScenario(scenario);
    },
    [engine],
  );

  const setOverride = React.useCallback(
    (name: string, songId: PatchSoundtrackId | null) => {
      engine.setOverride(name, songId);
    },
    [engine],
  );

  const setSuppressed = React.useCallback(
    (reason: string, active: boolean) => {
      engine.setSuppressed(reason, active);
    },
    [engine],
  );

  const sfx = React.useCallback(
    (name: SfxName) => {
      engine.sfx(name);
    },
    [engine],
  );

  const value = React.useMemo<MusicContextValue>(
    () => ({
      mute,
      setMute,
      volume,
      setVolume,
      soundtrack,
      setSoundtrack,
      setScenario,
      setOverride,
      setSuppressed,
      nowPlaying,
      sfx,
    }),
    [
      mute,
      setMute,
      volume,
      setVolume,
      soundtrack,
      setSoundtrack,
      setScenario,
      setOverride,
      setSuppressed,
      nowPlaying,
      sfx,
    ],
  );

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusic(): MusicContextValue {
  const ctx = React.useContext(MusicContext);
  if (ctx === null) {
    throw new Error("useMusic must be used inside <MusicProvider>");
  }
  return ctx;
}

/**
 * Safe variant for components that may render outside a MusicProvider during tests
 * or in code paths that pre-date the provider wrapping. Returns a no-op stub.
 */
export function useMusicSafe(): MusicContextValue {
  const ctx = React.useContext(MusicContext);
  if (ctx) return ctx;
  return {
    mute: false,
    setMute() {},
    volume: 0,
    setVolume() {},
    soundtrack: "auto",
    setSoundtrack() {},
    setScenario() {},
    setOverride() {},
    setSuppressed() {},
    nowPlaying: null,
    sfx() {},
  };
}

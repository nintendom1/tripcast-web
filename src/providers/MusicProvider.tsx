import * as React from "react";
import {
  createAudioEngine,
  resolveSoundtrackScenario,
  type AudioEngine,
  type AudioScenario,
  type AudioSoundtrack,
  type SfxName,
} from "@/lib/audio/engine";

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

function readSoundtrack(fallback: AudioSoundtrack): AudioSoundtrack {
  try {
    const raw = window.localStorage.getItem(SOUNDTRACK_KEY);
    if (raw === null) return fallback;
    return raw as AudioSoundtrack;
  } catch {
    return fallback;
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
  activeSoundtrack: AudioSoundtrack;
  setScenario: (scenario: AudioScenario) => void;
  setSuppressed: (reason: string, active: boolean) => void;
  sfx: (name: SfxName) => void;
}

const MusicContext = React.createContext<MusicContextValue | null>(null);

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
  const [soundtrack, setSoundtrackState] = React.useState<AudioSoundtrack>(() =>
    readSoundtrack("auto"),
  );
  const [scenario, setScenarioState] = React.useState<AudioScenario>("idle");

  const activeSoundtrack = React.useMemo(
    () => resolveSoundtrackScenario(scenario, soundtrack) as AudioSoundtrack,
    [scenario, soundtrack],
  );

  React.useEffect(() => {
    engine.armOnGesture();
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
    (next: AudioScenario) => {
      setScenarioState(next);
      engine.setScenario(next);
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
      activeSoundtrack,
      setScenario,
      setSuppressed,
      sfx,
    }),
    [
      mute,
      setMute,
      volume,
      setVolume,
      soundtrack,
      setSoundtrack,
      activeSoundtrack,
      setScenario,
      setSuppressed,
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
    activeSoundtrack: "idle",
    setScenario() {},
    setSuppressed() {},
    sfx() {},
  };
}

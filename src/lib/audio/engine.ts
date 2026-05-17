export type AudioScenario = "idle" | "voteActive" | "challengeActive" | "overBudget" | "story";

export type AudioSoundtrack =
  | "auto"
  | "idle"
  | "happy"
  | "morning"
  | "cafe"
  | "story"
  | "vote"
  | "challenge"
  | "night"
  | "midnight";

export type SfxName =
  | "pin"
  | "open"
  | "close"
  | "vote"
  | "success"
  | "tap"
  | "page"
  | "toast";

export interface AudioEngine {
  armOnGesture(): void;
  setMute(mute: boolean): void;
  setVolume(volume: number): void;
  setScenario(scenario: AudioScenario): void;
  setSoundtrack(soundtrack: AudioSoundtrack): void;
  sfx(name: SfxName): void;
}

type OscType = OscillatorType;

interface ToneSpec {
  frequency: number;
  start: number;
  duration: number;
  gain: number;
  type: OscType;
  pan?: number;
}

interface Composition {
  key: Exclude<AudioSoundtrack, "auto">;
  name: string;
  description: string;
  bpm: number;
  steps: number;
  scheduleStep: (ctx: AudioContext, time: number, step: number, playTone: (spec: ToneSpec) => void) => void;
}

const SCHEDULE_INTERVAL_MS = 300;
const LOOKAHEAD_SECONDS = 0.45;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function getAudioContextConstructor(): (new () => AudioContext) | null {
  if (typeof window === "undefined") return null;
  const maybeCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return maybeCtor ?? null;
}

function safeCreateContext(): AudioContext | null {
  const Ctor = getAudioContextConstructor();
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

function resolveIdleByHour(hour: number): Exclude<AudioSoundtrack, "auto"> {
  if (hour >= 0 && hour < 6) return "midnight";
  if (hour >= 19) return "night";
  return "idle";
}

function resolveSoundtrack(soundtrack: AudioSoundtrack, scenario: AudioScenario): Exclude<AudioSoundtrack, "auto"> {
  if (soundtrack !== "auto") return soundtrack;
  if (scenario === "story") return "story";
  if (scenario === "voteActive") return "vote";
  if (scenario === "challengeActive" || scenario === "overBudget") return "challenge";
  return resolveIdleByHour(new Date().getHours());
}

const COMPOSITIONS: Record<Exclude<AudioSoundtrack, "auto">, Composition> = {
  // Kisaragi Morning: soft triangle lead, pentatonic motif, warm sustained pad.
  morning: {
    key: "morning",
    name: "Kisaragi Morning",
    description: "Calm morning ambience with soft pentatonic lead and gentle pad.",
    bpm: 76,
    steps: 8,
    scheduleStep(ctx, time, step, playTone) {
      const motif = [69, 72, 74, 76, 74, 72, 69, 67];
      playTone({ frequency: midiToHz(motif[step]), start: time, duration: 0.26, gain: 0.1, type: "triangle", pan: -0.15 });
      if (step % 4 === 0) playTone({ frequency: midiToHz(step % 8 === 0 ? 57 : 60), start: time, duration: 0.95, gain: 0.04, type: "sine", pan: 0.2 });
    },
  },
  // Station Cafe Loop: mellow chord stabs with tiny ticking arpeggio.
  cafe: {
    key: "cafe",
    name: "Station Cafe Loop",
    description: "Relaxed browsing loop with mellow chords and light arpeggio ticks.",
    bpm: 84,
    steps: 8,
    scheduleStep(ctx, time, step, playTone) {
      const chords = [[60, 64, 67], [62, 65, 69], [57, 60, 64], [59, 62, 65]];
      if (step % 2 === 0) {
        for (const midi of chords[Math.floor(step / 2) % chords.length]) {
          playTone({ frequency: midiToHz(midi), start: time, duration: 0.42, gain: 0.052, type: "triangle", pan: -0.1 });
        }
      }
      const arp = [72, 76, 79, 76, 74, 76, 72, 69];
      playTone({ frequency: midiToHz(arp[step]), start: time + 0.02, duration: 0.16, gain: 0.045, type: "sine", pan: 0.1 });
    },
  },
  // Maple Idle Theme: minimal music-box cue for default map view.
  idle: {
    key: "idle",
    name: "Maple Idle Theme",
    description: "Low-motion idle map loop with music-box lead and soft underpad.",
    bpm: 70,
    steps: 8,
    scheduleStep(ctx, time, step, playTone) {
      const lead = [76, 74, 72, 69, 72, 74, 76, 72];
      playTone({ frequency: midiToHz(lead[step]), start: time, duration: 0.2, gain: 0.08, type: "sine", pan: step % 2 === 0 ? -0.08 : 0.08 });
      if (step % 4 === 0) playTone({ frequency: midiToHz(52), start: time, duration: 1.05, gain: 0.03, type: "triangle" });
    },
  },

  // Akari Night Walk: gentle evening loop for nighttime idle browsing.
  night: {
    key: "night",
    name: "Akari Night Walk",
    description: "Warm evening idle loop with mellow bell motif and soft bass cushion.",
    bpm: 66,
    steps: 8,
    scheduleStep(ctx, time, step, playTone) {
      const motif = [72, 69, 67, 69, 71, 69, 67, 64];
      playTone({ frequency: midiToHz(motif[step]), start: time, duration: 0.22, gain: 0.065, type: "triangle", pan: step % 2 === 0 ? -0.1 : 0.1 });
      if (step % 4 === 0) playTone({ frequency: midiToHz(48), start: time, duration: 0.95, gain: 0.028, type: "sine" });
    },
  },
  // Midnight Lantern: very soft late-night idle ambience from 12am to 6am.
  midnight: {
    key: "midnight",
    name: "Midnight Lantern",
    description: "Ultra-soft late-night ambience with sparse notes and airy pad.",
    bpm: 58,
    steps: 8,
    scheduleStep(ctx, time, step, playTone) {
      const notes = [67, 64, 62, 64, 65, 64, 62, 60];
      playTone({ frequency: midiToHz(notes[step]), start: time, duration: 0.24, gain: 0.052, type: "sine", pan: -0.04 });
      if (step % 4 === 0) playTone({ frequency: midiToHz(43), start: time, duration: 1.15, gain: 0.02, type: "triangle", pan: 0.08 });
    },
  },
  // Sunlit Choice: brighter bell and uplift arpeggio for positive state.
  happy: {
    key: "happy",
    name: "Sunlit Choice",
    description: "Bright but gentle uplifting loop for positive selections.",
    bpm: 92,
    steps: 8,
    scheduleStep(ctx, time, step, playTone) {
      const arp = [72, 76, 79, 84, 79, 76, 74, 76];
      playTone({ frequency: midiToHz(arp[step]), start: time, duration: 0.2, gain: 0.085, type: "triangle", pan: 0.15 });
      if (step % 2 === 0) playTone({ frequency: midiToHz(60 + (step % 4 === 0 ? 0 : 5)), start: time, duration: 0.32, gain: 0.05, type: "sine", pan: -0.2 });
    },
  },
  // Turning Page: sparse descending motif for story reading moments.
  story: {
    key: "story",
    name: "Turning Page",
    description: "Sparse emotional reading cue with a descending visual novel motif.",
    bpm: 64,
    steps: 8,
    scheduleStep(ctx, time, step, playTone) {
      const notes = [79, 76, 74, 72, 71, 69, 67, 69];
      playTone({ frequency: midiToHz(notes[step]), start: time, duration: 0.24, gain: 0.07, type: "sine", pan: -0.05 });
      if (step % 4 === 0) playTone({ frequency: midiToHz(55), start: time, duration: 0.85, gain: 0.03, type: "triangle", pan: 0.1 });
    },
  },
  // Vote Clock Waltz: light pulse with subtle tension for active voting.
  vote: {
    key: "vote",
    name: "Vote Clock Waltz",
    description: "Non-alarming pulse and plucked lead for route vote timing context.",
    bpm: 96,
    steps: 12,
    scheduleStep(ctx, time, step, playTone) {
      const seq = [69, 72, 74, 72, 71, 72, 67, 69, 71, 69, 67, 65];
      if (step % 3 === 0) playTone({ frequency: midiToHz(48), start: time, duration: 0.17, gain: 0.038, type: "sine", pan: -0.1 });
      playTone({ frequency: midiToHz(seq[step]), start: time + 0.01, duration: 0.15, gain: 0.065, type: "triangle", pan: 0.12 });
    },
  },
  // Mission Footsteps: forward arpeggio with low pulse for challenges.
  challenge: {
    key: "challenge",
    name: "Mission Footsteps",
    description: "Slightly more forward arpeggio and low pulse for mission focus.",
    bpm: 102,
    steps: 8,
    scheduleStep(ctx, time, step, playTone) {
      const arp = [57, 60, 64, 67, 64, 60, 62, 64];
      playTone({ frequency: midiToHz(arp[step]), start: time, duration: 0.16, gain: 0.07, type: "triangle", pan: -0.12 });
      if (step % 2 === 0) playTone({ frequency: midiToHz(45), start: time, duration: 0.2, gain: 0.032, type: "sine", pan: 0.12 });
    },
  },
};

export function createAudioEngine(): AudioEngine {
  let mute = false;
  let volume = 0.3;
  let scenario: AudioScenario = "idle";
  let soundtrack: AudioSoundtrack = "auto";
  let gestureArmed = false;
  let started = false;

  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let musicGain: GainNode | null = null;
  let sfxGain: GainNode | null = null;

  let loopTimer: ReturnType<typeof setInterval> | null = null;
  let nextNoteTime = 0;
  let stepIndex = 0;
  let activeCompositionKey: Exclude<AudioSoundtrack, "auto"> | null = null;

  const removeGestureListeners = () => {
    if (typeof window === "undefined") return;
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
    window.removeEventListener("touchstart", onGesture);
    gestureArmed = false;
  };

  const updateMasterVolume = () => {
    if (!masterGain || !ctx) return;
    const target = mute ? 0 : 0.45 * clamp(volume, 0, 1);
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.03);
  };

  const ensureGraph = () => {
    if (!ctx) return;
    if (!masterGain) {
      masterGain = ctx.createGain();
      musicGain = ctx.createGain();
      sfxGain = ctx.createGain();
      masterGain.gain.value = 0;
      musicGain.gain.value = 1;
      sfxGain.gain.value = 1;
      musicGain.connect(masterGain);
      sfxGain.connect(masterGain);
      masterGain.connect(ctx.destination);
      updateMasterVolume();
    }
  };

  const playTone = (spec: ToneSpec) => {
    if (!ctx || !musicGain || !sfxGain || !masterGain || mute) return;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const out = spec.duration <= 0.35 ? sfxGain : musicGain;
    let node: AudioNode = gainNode;
    if (typeof spec.pan === "number") {
      const pan = ctx.createStereoPanner();
      pan.pan.value = clamp(spec.pan, -1, 1);
      gainNode.connect(pan);
      pan.connect(out);
      node = pan;
    } else {
      gainNode.connect(out);
    }

    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.frequency, spec.start);

    const attackEnd = spec.start + 0.01;
    const releaseStart = spec.start + Math.max(0.02, spec.duration - 0.08);
    const endTime = spec.start + spec.duration;

    gainNode.gain.setValueAtTime(0.0001, spec.start);
    gainNode.gain.linearRampToValueAtTime(spec.gain, attackEnd);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, spec.gain * 0.4), releaseStart);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);

    osc.connect(gainNode);
    osc.start(spec.start);
    osc.stop(endTime + 0.01);
    osc.onended = () => {
      osc.disconnect();
      gainNode.disconnect();
      node.disconnect?.();
    };
  };

  const stopLoop = () => {
    if (loopTimer) {
      clearInterval(loopTimer);
      loopTimer = null;
    }
  };

  const schedulerTick = () => {
    if (!ctx || mute) return;
    const composition = COMPOSITIONS[activeCompositionKey ?? resolveSoundtrack(soundtrack, scenario)];
    const beatDuration = 60 / composition.bpm;
    while (nextNoteTime < ctx.currentTime + LOOKAHEAD_SECONDS) {
      composition.scheduleStep(ctx, nextNoteTime, stepIndex % composition.steps, playTone);
      nextNoteTime += beatDuration;
      stepIndex = (stepIndex + 1) % composition.steps;
    }
  };

  const startLoop = () => {
    if (!ctx || mute) return;
    const nextKey = resolveSoundtrack(soundtrack, scenario);
    if (activeCompositionKey !== nextKey) {
      activeCompositionKey = nextKey;
      stepIndex = 0;
    }
    if (loopTimer) return;
    nextNoteTime = Math.max(ctx.currentTime + 0.02, nextNoteTime || 0);
    loopTimer = setInterval(schedulerTick, SCHEDULE_INTERVAL_MS);
  };

  const syncLoopToState = () => {
    if (!started || !ctx) return;
    updateMasterVolume();
    if (mute) {
      stopLoop();
      return;
    }
    startLoop();
  };

  const onGesture = () => {
    if (started) return;
    ctx = safeCreateContext();
    if (!ctx) {
      removeGestureListeners();
      return;
    }
    ensureGraph();
    void ctx.resume().catch(() => {});
    started = true;
    removeGestureListeners();
    syncLoopToState();
  };

  return {
    armOnGesture() {
      if (gestureArmed || started || typeof window === "undefined") return;
      if (!getAudioContextConstructor()) return;
      window.addEventListener("pointerdown", onGesture, { passive: true, once: true });
      window.addEventListener("keydown", onGesture, { passive: true, once: true });
      window.addEventListener("touchstart", onGesture, { passive: true, once: true });
      gestureArmed = true;
    },
    setMute(nextMute: boolean) {
      if (mute === nextMute) return;
      mute = nextMute;
      syncLoopToState();
    },
    setVolume(nextVolume: number) {
      const clamped = clamp(nextVolume, 0, 1);
      if (volume === clamped) return;
      volume = clamped;
      updateMasterVolume();
    },
    setScenario(nextScenario: AudioScenario) {
      if (scenario === nextScenario) return;
      scenario = nextScenario;
      const resolved = resolveSoundtrack(soundtrack, scenario);
      if (soundtrack === "auto" && activeCompositionKey !== resolved) {
        activeCompositionKey = resolved;
        stepIndex = 0;
      }
    },
    setSoundtrack(nextSoundtrack: AudioSoundtrack) {
      if (soundtrack === nextSoundtrack) return;
      soundtrack = nextSoundtrack;
      const resolved = resolveSoundtrack(soundtrack, scenario);
      if (activeCompositionKey !== resolved) {
        activeCompositionKey = resolved;
        stepIndex = 0;
      }
    },
    sfx(name: SfxName) {
      if (!ctx || mute || !started) return;
      const base = ctx.currentTime + 0.005;
      if (name === "tap") playTone({ frequency: midiToHz(84), start: base, duration: 0.08, gain: 0.05, type: "sine" });
      if (name === "open") {
        playTone({ frequency: midiToHz(76), start: base, duration: 0.14, gain: 0.06, type: "triangle" });
        playTone({ frequency: midiToHz(81), start: base + 0.11, duration: 0.2, gain: 0.07, type: "sine" });
      }
      if (name === "close") {
        playTone({ frequency: midiToHz(81), start: base, duration: 0.12, gain: 0.06, type: "sine" });
        playTone({ frequency: midiToHz(76), start: base + 0.1, duration: 0.16, gain: 0.05, type: "triangle" });
      }
      if (name === "pin") playTone({ frequency: midiToHz(88), start: base, duration: 0.16, gain: 0.08, type: "triangle", pan: 0.1 });
      if (name === "vote") {
        playTone({ frequency: midiToHz(74), start: base, duration: 0.1, gain: 0.05, type: "sine" });
        playTone({ frequency: midiToHz(79), start: base + 0.08, duration: 0.12, gain: 0.055, type: "triangle" });
      }
      if (name === "success") {
        const motif = [72, 76, 79];
        motif.forEach((m, i) => playTone({ frequency: midiToHz(m), start: base + i * 0.09, duration: 0.16, gain: 0.06, type: "triangle" }));
      }
      if (name === "page") {
        playTone({ frequency: midiToHz(67), start: base, duration: 0.1, gain: 0.04, type: "sine", pan: -0.2 });
        playTone({ frequency: midiToHz(71), start: base + 0.05, duration: 0.1, gain: 0.04, type: "sine", pan: 0.2 });
      }
      if (name === "toast") playTone({ frequency: midiToHz(83), start: base, duration: 0.22, gain: 0.06, type: "triangle" });
    },
  };
}

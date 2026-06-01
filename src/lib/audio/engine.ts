/**
 * TripCast synthesized audio engine.
 *
 * No audio files are used. The engine stays dormant until the first user
 * gesture so browser autoplay rules are respected.
 */

import { debugLoggerFor } from "@/debug/useDebugLogger";
import { PATCHES, isPatchSoundtrack, type PatchSoundtrackId } from "./patches";
import { computeLoopSeconds, scheduleOneLoop } from "./patchRenderer";
import type { MusicEditorPatch } from "./patchTypes";

export type AudioScenario = "idle" | "voteActive" | "missionActive" | "overBudget" | "story";

export type AudioSoundtrack =
  | "auto"
  | "idle"
  | "happy"
  | "morning"
  | "cafe"
  | "story"
  | "vote"
  | "mission"
  | PatchSoundtrackId;

export type SfxName =
  | "pin"
  | "open"
  | "close"
  | "vote"
  | "success"
  | "tap"
  | "page"
  | "toast"
  | "plop"
  | "bubble";

export interface AudioEngine {
  armOnGesture(): void;
  setMute(mute: boolean): void;
  setVolume(volume: number): void;
  setScenario(scenario: AudioScenario): void;
  setSoundtrack(soundtrack: AudioSoundtrack): void;
  /**
   * Silences the soundtrack for a named reason without touching the user's
   * saved mute preference. The engine stays silenced while ANY reason is
   * active, so independent callers (e.g. "auth", "error") never clobber each
   * other. Pass `active: false` with the same reason to release it.
   */
  setSuppressed(reason: string, active: boolean): void;
  sfx(name: SfxName): void;
}

type BrowserWindowWithAudio = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

type Chord = {
  name: string;
  bass: number;
  notes: number[];
  arp: number[];
};

type Progression = {
  bpm: number;
  chords: Chord[];
};

const PROGRESSIONS: Record<string, Progression> = {
  idle: {
    bpm: 64,
    chords: [
      { name: "Cmaj7", bass: 36, notes: [60, 64, 67, 71], arp: [64, 67, 71, 67] },
      { name: "Am7", bass: 33, notes: [57, 60, 64, 67], arp: [60, 64, 67, 64] },
      { name: "Fmaj7", bass: 29, notes: [53, 57, 60, 64], arp: [57, 60, 64, 60] },
      { name: "G7sus4", bass: 31, notes: [55, 60, 62, 65], arp: [60, 62, 65, 62] },
    ],
  },
  happy: {
    bpm: 88,
    chords: [
      { name: "F", bass: 29, notes: [53, 57, 60, 65], arp: [65, 69, 72, 69] },
      { name: "Am7", bass: 33, notes: [57, 60, 64, 67], arp: [64, 67, 72, 67] },
      { name: "Bb", bass: 34, notes: [58, 62, 65, 70], arp: [65, 70, 74, 70] },
      { name: "C", bass: 24, notes: [60, 64, 67, 72], arp: [67, 72, 76, 72] },
    ],
  },
  morning: {
    bpm: 78,
    chords: [
      { name: "Dmaj7", bass: 26, notes: [62, 66, 69, 73], arp: [66, 69, 73, 78] },
      { name: "Gmaj7", bass: 31, notes: [55, 62, 66, 71], arp: [62, 66, 71, 74] },
      { name: "Bm7", bass: 35, notes: [59, 62, 66, 69], arp: [62, 66, 69, 74] },
      { name: "A", bass: 33, notes: [57, 64, 69, 73], arp: [64, 69, 73, 76] },
    ],
  },
  cafe: {
    bpm: 74,
    chords: [
      { name: "C", bass: 36, notes: [60, 64, 67, 72], arp: [67, 72, 76, 72] },
      { name: "Em7", bass: 28, notes: [52, 59, 62, 66], arp: [62, 66, 71, 66] },
      { name: "Am", bass: 33, notes: [57, 60, 64, 69], arp: [64, 69, 72, 69] },
      { name: "F", bass: 29, notes: [53, 57, 60, 65], arp: [60, 65, 69, 65] },
    ],
  },
  story: {
    bpm: 56,
    chords: [
      { name: "Gmaj7", bass: 31, notes: [55, 59, 62, 66], arp: [59, 62, 66, 71] },
      { name: "Bm7", bass: 35, notes: [59, 62, 66, 69], arp: [62, 66, 69, 71] },
      { name: "Em9", bass: 28, notes: [52, 59, 62, 66], arp: [59, 62, 66, 67] },
      { name: "Cmaj7", bass: 24, notes: [48, 60, 64, 67], arp: [60, 64, 67, 71] },
    ],
  },
  vote: {
    bpm: 84,
    chords: [
      { name: "Dm9", bass: 26, notes: [50, 57, 60, 64], arp: [57, 60, 64, 67] },
      { name: "Bbmaj7", bass: 22, notes: [46, 53, 57, 60], arp: [53, 57, 60, 65] },
      { name: "Gm7", bass: 31, notes: [55, 58, 62, 65], arp: [58, 62, 65, 67] },
      { name: "A7sus", bass: 33, notes: [57, 64, 67, 71], arp: [64, 67, 71, 74] },
    ],
  },
  mission: {
    bpm: 92,
    chords: [
      { name: "Em", bass: 28, notes: [52, 59, 64, 67], arp: [59, 64, 67, 71] },
      { name: "Cmaj7", bass: 24, notes: [48, 60, 64, 67], arp: [60, 64, 67, 64] },
      { name: "Am", bass: 33, notes: [57, 60, 64, 69], arp: [60, 64, 69, 64] },
      { name: "Bm7", bass: 35, notes: [59, 62, 66, 69], arp: [62, 66, 69, 66] },
    ],
  },
  overBudget: {
    bpm: 50,
    chords: [
      { name: "Am", bass: 33, notes: [57, 60, 64], arp: [60, 64, 67, 64] },
      { name: "Fm", bass: 29, notes: [53, 56, 60], arp: [56, 60, 65, 60] },
      { name: "Csus2", bass: 24, notes: [48, 50, 55], arp: [50, 55, 60, 55] },
      { name: "G", bass: 31, notes: [55, 59, 62], arp: [59, 62, 67, 62] },
    ],
  },
};

export function resolveSoundtrackScenario(
  scenario: AudioScenario,
  soundtrack: AudioSoundtrack,
): keyof typeof PROGRESSIONS | PatchSoundtrackId {
  if (soundtrack !== "auto") return soundtrack;
  if (scenario === "voteActive") return "vote";
  if (scenario === "missionActive") return "mission";
  return scenario;
}

function browserWindow(): BrowserWindowWithAudio | null {
  if (typeof window === "undefined") return null;
  return window as BrowserWindowWithAudio;
}

function midiToFrequency(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

class TripcastAudioEngine implements AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: GainNode | null = null;
  private patchBus: GainNode | null = null;
  private scheduler: ReturnType<typeof setTimeout> | null = null;
  private scheduledAt = 0;
  private beat = 0;
  private patchCursor = 0;
  private scenario: AudioScenario = "idle";
  private soundtrack: AudioSoundtrack = "auto";
  private volume = 0.3;
  private muted = false;
  private started = false;
  private armed = false;
  private suppressions = new Set<string>();
  private log = debugLoggerFor("AudioEngine", "src/lib/audio/engine.ts");

  /** Silenced when hard-muted by the user OR any suppression reason is active. */
  private get silenced(): boolean {
    return this.muted || this.suppressions.size > 0;
  }

  /** Ramp the master gain toward its effective target (silence vs. volume). */
  private applyGain(): void {
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.silenced ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
  }

  armOnGesture(): void {
    if (this.started || this.armed) return;
    const win = browserWindow();
    if (!win) return;
    const handler = () => {
      this.start();
      win.removeEventListener("pointerdown", handler);
      win.removeEventListener("keydown", handler);
    };
    this.armed = true;
    this.log.logAudio("engine:armed", {});
    win.addEventListener("pointerdown", handler, { once: false });
    win.addEventListener("keydown", handler, { once: false });
  }

  setMute(mute: boolean): void {
    if (this.muted === mute) return;
    this.muted = mute;
    this.log.logAudio("engine:mute", { muted: mute, silenced: this.silenced });
    this.applyGain();
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (!this.silenced) this.applyGain();
  }

  setSuppressed(reason: string, active: boolean): void {
    const had = this.suppressions.has(reason);
    if (had === active) return;
    if (active) this.suppressions.add(reason);
    else this.suppressions.delete(reason);
    this.log.logAudio("engine:suppress", {
      reason,
      active,
      reasons: [...this.suppressions],
      silenced: this.silenced,
    });
    this.applyGain();
  }

  setScenario(scenario: AudioScenario): void {
    if (this.scenario === scenario) return;
    this.scenario = scenario;
    this.log.logAudio("engine:scenario", { scenario });
  }

  setSoundtrack(soundtrack: AudioSoundtrack): void {
    if (this.soundtrack === soundtrack) return;
    this.soundtrack = soundtrack;
    this.log.logAudio("engine:soundtrack", { soundtrack });
    if (this.ctx) {
      const anchor = this.ctx.currentTime + 0.05;
      this.scheduledAt = anchor;
      this.beat = 0;
      this.patchCursor = anchor;
      // Patches pre-schedule a whole loop (potentially 20+s) into the audio
      // graph, so a soundtrack switch must actively silence the previous
      // patch — fade out the old patchBus and route subsequent patch
      // playback through a fresh bus.
      if (this.patchBus && this.master) {
        const old = this.patchBus;
        const now = this.ctx.currentTime;
        old.gain.cancelScheduledValues(now);
        old.gain.setValueAtTime(old.gain.value, now);
        old.gain.linearRampToValueAtTime(0, now + 0.08);
        setTimeout(() => {
          try { old.disconnect(); } catch { /* already disconnected */ }
        }, 250);
        const next = this.ctx.createGain();
        next.gain.value = 1;
        next.connect(this.master);
        this.patchBus = next;
      }
    }
  }

  sfx(name: SfxName): void {
    if (!this.started || this.muted || !this.ctx || !this.master) return;
    this.log.logAudio("engine:sfx", { name, suppressed: this.suppressions.size > 0 });
    const now = this.ctx.currentTime;
    const tone = (freq: number, dur: number, type: OscillatorType = "sine", gain = 0.12, delay = 0) => {
      this.playTone(freq, now + delay, dur, type, gain);
    };

    switch (name) {
      case "pin":
        tone(880, 0.18, "sine", 0.14);
        tone(1320, 0.22, "sine", 0.08);
        break;
      case "open":
        tone(660, 0.12, "triangle", 0.10);
        tone(990, 0.14, "sine", 0.06);
        break;
      case "close":
        tone(440, 0.12, "triangle", 0.08);
        break;
      case "vote":
        tone(523, 0.08, "sine", 0.12);
        tone(784, 0.14, "triangle", 0.10, 0.07);
        break;
      case "success":
        tone(659, 0.12, "triangle", 0.14);
        tone(784, 0.14, "triangle", 0.14, 0.09);
        tone(988, 0.22, "sine", 0.10, 0.20);
        break;
      case "tap":
        tone(2200, 0.03, "sine", 0.05);
        break;
      case "page":
        tone(880, 0.05, "sine", 0.06);
        break;
      case "toast":
        tone(1320, 0.06, "sine", 0.08);
        break;
      case "plop":
        // Soft, happy little lift for the account-creation punch.
        tone(523, 0.15, "sine", 0.10);        // C5 — gentle round body
        tone(784, 0.11, "sine", 0.06, 0.04);  // rising to G5 — bright, cheerful lift
        break;
      case "bubble":
        // Soft, gentle, slightly hollow — the error fallback's "pop".
        tone(520, 0.05, "sine", 0.09);
        tone(720, 0.04, "sine", 0.05, 0.02);
        break;
    }
  }

  private start(): void {
    if (this.started) return;
    const win = browserWindow();
    const Ctor = win?.AudioContext ?? win?.webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.silenced ? 0 : this.volume;
    this.master.connect(ctx.destination);

    const reverb = ctx.createGain();
    reverb.gain.value = 0.25;
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.35;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.55;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 2400;

    reverb.connect(delay);
    delay.connect(lowpass);
    lowpass.connect(feedback);
    feedback.connect(delay);
    lowpass.connect(this.master);
    this.reverb = reverb;

    this.patchBus = ctx.createGain();
    this.patchBus.gain.value = 1;
    this.patchBus.connect(this.master);

    this.started = true;
    this.beat = 0;
    this.scheduledAt = ctx.currentTime + 0.1;
    this.patchCursor = ctx.currentTime + 0.1;
    this.log.logAudio("engine:start", { silenced: this.silenced, soundtrack: this.soundtrack });
    this.scheduleLoop();
  }

  private resolvedSoundtrack(): keyof typeof PROGRESSIONS | PatchSoundtrackId {
    return resolveSoundtrackScenario(this.scenario, this.soundtrack);
  }

  private scheduleLoop(): void {
    if (!this.started || !this.ctx) return;
    const lookahead = 0.4;
    const resolved = this.resolvedSoundtrack();

    if (isPatchSoundtrack(resolved)) {
      this.schedulePatchTick(PATCHES[resolved], lookahead);
    } else {
      this.scheduleProceduralTick(PROGRESSIONS[resolved], lookahead);
    }

    this.scheduler = setTimeout(() => this.scheduleLoop(), 100);
  }

  private scheduleProceduralTick(progression: Progression, lookahead: number): void {
    if (!this.ctx) return;
    while (this.scheduledAt < this.ctx.currentTime + lookahead) {
      const secPerBeat = 60 / progression.bpm;
      const beatInBar = this.beat % 4;
      const chord = progression.chords[Math.floor(this.beat / 4) % progression.chords.length];
      const at = this.scheduledAt;

      if (beatInBar === 0) {
        chord.notes.forEach((note) => this.pad(note, at, secPerBeat * 4.1, 0.045));
        this.bass(chord.bass, at, secPerBeat * 0.9, 0.18);
      }
      if (beatInBar === 2) {
        this.bass(chord.bass + 7, at, secPerBeat * 0.9, 0.12);
      }
      if (Math.random() > 0.16) {
        const swing = beatInBar % 2 === 1 ? 0.04 : 0;
        this.piano(chord.arp[beatInBar], at + swing * secPerBeat, secPerBeat * 1.4, 0.16);
      }
      if (beatInBar === 3 && Math.random() < 0.4) {
        this.piano(chord.arp[0] + 12, at + secPerBeat * 0.5, secPerBeat * 1.6, 0.08);
      }

      this.scheduledAt += secPerBeat;
      this.beat += 1;
    }
  }

  private schedulePatchTick(patch: MusicEditorPatch, lookahead: number): void {
    if (!this.ctx || !this.patchBus) return;
    const loopSec = computeLoopSeconds(patch);
    if (loopSec <= 0) return;
    while (this.patchCursor < this.ctx.currentTime + lookahead) {
      scheduleOneLoop(this.ctx, this.patchBus, patch, this.patchCursor);
      this.patchCursor += loopSec;
    }
  }

  private connectWithReverb(env: GainNode, sendGain: number) {
    if (!this.master) return;
    env.connect(this.master);
    if (this.reverb) {
      const send = this.ctx!.createGain();
      send.gain.value = sendGain;
      env.connect(send);
      send.connect(this.reverb);
    }
  }

  private piano(midi: number, when: number, dur = 1.4, gain = 0.22) {
    if (!this.ctx) return;
    const freq = midiToFrequency(midi);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2200, when);
    filter.frequency.exponentialRampToValueAtTime(900, when + dur);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(gain, when + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, when + dur);

    const body = this.ctx.createOscillator();
    body.type = "triangle";
    body.frequency.value = freq;
    const sub = this.ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = freq / 2;
    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.3;

    body.connect(filter);
    sub.connect(subGain);
    subGain.connect(filter);
    filter.connect(env);
    this.connectWithReverb(env, 0.4);

    body.start(when);
    sub.start(when);
    body.stop(when + dur + 0.1);
    sub.stop(when + dur + 0.1);
  }

  private pad(midi: number, when: number, dur = 3, gain = 0.08) {
    if (!this.ctx) return;
    const freq = midiToFrequency(midi);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(gain, when + 0.6);
    env.gain.setValueAtTime(gain, Math.max(when + 0.7, when + dur - 0.8));
    env.gain.linearRampToValueAtTime(0.0001, when + dur);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;

    [-7, 0, 7].forEach((detune, index) => {
      const oscillator = this.ctx!.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = freq;
      oscillator.detune.value = detune;
      const level = this.ctx!.createGain();
      level.gain.value = index === 1 ? 1 : 0.4;
      oscillator.connect(level);
      level.connect(filter);
      oscillator.start(when);
      oscillator.stop(when + dur + 0.1);
    });

    filter.connect(env);
    this.connectWithReverb(env, 0.3);
  }

  private bass(midi: number, when: number, dur = 0.8, gain = 0.16) {
    if (!this.ctx) return;
    this.playTone(midiToFrequency(midi), when, dur, "sine", gain, 400);
  }

  private playTone(
    freq: number,
    when: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    lowpass?: number,
  ) {
    if (!this.ctx) return;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(gain, when + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, when + dur);

    const oscillator = this.ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = freq;

    if (lowpass) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = lowpass;
      oscillator.connect(filter);
      filter.connect(env);
    } else {
      oscillator.connect(env);
    }

    this.connectWithReverb(env, 0.25);
    oscillator.start(when);
    oscillator.stop(when + dur + 0.1);
  }
}

export function createAudioEngine(): AudioEngine {
  return new TripcastAudioEngine();
}

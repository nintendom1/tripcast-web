/**
 * TripCast synthesized audio engine.
 *
 * The soundtrack layer is patch-driven (music-editor exports); SFX continues
 * to use procedural synthesis. The engine stays dormant until the first user
 * gesture so browser autoplay rules are respected.
 */

import { debugLoggerFor } from "@/debug/useDebugLogger";
import { PATCHES, type PatchSoundtrackId } from "./patches";
import { computeLoopSeconds, scheduleOneLoop } from "./patchRenderer";

export type AudioScenario = "story" | "trophy" | "vote" | "default-day" | "default-night";

export type AudioSoundtrack = "auto" | PatchSoundtrackId;

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
  setOverride(name: string, songId: PatchSoundtrackId | null): void;
  /**
   * Silences the soundtrack for a named reason without touching the user's
   * saved mute preference. The engine stays silenced while ANY reason is
   * active, so independent callers (e.g. "auth", "error") never clobber each
   * other. Pass `active: false` with the same reason to release it.
   */
  setSuppressed(reason: string, active: boolean): void;
  onResolutionChange(cb: (resolved: PatchSoundtrackId) => void): () => void;
  getResolution(): PatchSoundtrackId;
  sfx(name: SfxName): void;
}

type BrowserWindowWithAudio = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

const SCENARIO_SONG: Record<AudioScenario, PatchSoundtrackId> = {
  story: "song7_story",
  trophy: "song8_trophy",
  vote: "song6_vote",
  "default-day": "song4_day",
  "default-night": "song4_night",
};

/** Pure resolution: returns the patch id that should play right now. */
export function resolveSoundtrack(args: {
  scenario: AudioScenario;
  soundtrack: AudioSoundtrack;
  overrides: ReadonlyMap<string, PatchSoundtrackId>;
}): PatchSoundtrackId {
  if (args.overrides.size > 0) {
    let last: PatchSoundtrackId | undefined;
    for (const id of args.overrides.values()) last = id;
    if (last) return last;
  }
  if (args.soundtrack === "auto") return SCENARIO_SONG[args.scenario];
  return args.soundtrack;
}

function browserWindow(): BrowserWindowWithAudio | null {
  if (typeof window === "undefined") return null;
  return window as BrowserWindowWithAudio;
}

function midiToFrequency(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Soundtrack transition: old patch fades out over this duration, then the new
 * patch starts. Tweak here to retune the fade-out / start feel.
 */
const FADE_OUT_SECONDS = 0.5;

/**
 * When an override CLEARS, defer the resolution recompute by this many ms so
 * an incoming scenario change has time to land first. Prevents brief
 * resolution flicker on natural override-to-scenario handoffs (e.g. vote
 * splash dismissed because user tapped to open the vote panel).
 */
const OVERRIDE_CLEAR_DEFER_MS = 250;

class TripcastAudioEngine implements AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: GainNode | null = null;
  private patchBus: GainNode | null = null;
  private scheduler: ReturnType<typeof setTimeout> | null = null;
  private pendingResolutionTimer: ReturnType<typeof setTimeout> | null = null;
  private patchCursor = 0;
  private scenario: AudioScenario = "default-day";
  private soundtrack: AudioSoundtrack = "auto";
  private overrides = new Map<string, PatchSoundtrackId>();
  private resolutionListeners = new Set<(r: PatchSoundtrackId) => void>();
  private currentResolution: PatchSoundtrackId = "song4_day";
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
    const wasSilenced = this.silenced;
    this.muted = mute;
    this.log.logAudio("engine:mute", { muted: mute, silenced: this.silenced });
    if (wasSilenced && !this.silenced) this.flushPatchBusForResume();
    this.applyGain();
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (!this.silenced) this.applyGain();
  }

  setSuppressed(reason: string, active: boolean): void {
    const had = this.suppressions.has(reason);
    if (had === active) return;
    const wasSilenced = this.silenced;
    if (active) this.suppressions.add(reason);
    else this.suppressions.delete(reason);
    this.log.logAudio("engine:suppress", {
      reason,
      active,
      reasons: [...this.suppressions],
      silenced: this.silenced,
    });
    if (wasSilenced && !this.silenced) this.flushPatchBusForResume();
    this.applyGain();
  }

  /**
   * On the transition out of silence (mute released, last suppression
   * cleared), patch events scheduled BEFORE silence began are still queued
   * on the current patchBus and would resume audibly alongside the freshly-
   * scheduled events — two overlapping loops of the same song. Disconnect
   * the old bus and start a new one so playback resumes cleanly from the
   * top of the current resolution's loop.
   */
  private flushPatchBusForResume(): void {
    if (!this.started || !this.ctx || !this.master) return;
    if (this.patchBus) {
      try { this.patchBus.disconnect(); } catch { /* already disconnected */ }
    }
    const next = this.ctx.createGain();
    next.gain.value = 1;
    next.connect(this.master);
    this.patchBus = next;
    this.patchCursor = this.ctx.currentTime + 0.05;
  }

  setScenario(scenario: AudioScenario): void {
    if (this.scenario === scenario) return;
    this.scenario = scenario;
    this.log.logAudio("engine:scenario", { scenario });
    this.applyResolution();
  }

  setSoundtrack(soundtrack: AudioSoundtrack): void {
    if (this.soundtrack === soundtrack) return;
    this.soundtrack = soundtrack;
    this.log.logAudio("engine:soundtrack", { soundtrack });
    this.applyResolution();
  }

  setOverride(name: string, songId: PatchSoundtrackId | null): void {
    if (songId === null) {
      if (!this.overrides.has(name)) return;
      this.overrides.delete(name);
      this.log.logAudio("engine:override", { name, songId: null, active: [...this.overrides] });
      // Defer the recompute so a racing scenario commit (e.g. RouteVotePanel
      // opening as the vote splash dismisses) can keep the resolution stable.
      this.scheduleDeferredResolution();
      return;
    }
    if (this.overrides.get(name) === songId) return;
    // Re-insert so the new entry sits at LIFO tail.
    this.overrides.delete(name);
    this.overrides.set(name, songId);
    this.log.logAudio("engine:override", { name, songId, active: [...this.overrides] });
    this.applyResolution();
  }

  private scheduleDeferredResolution(): void {
    if (this.pendingResolutionTimer) clearTimeout(this.pendingResolutionTimer);
    this.pendingResolutionTimer = setTimeout(() => {
      this.pendingResolutionTimer = null;
      this.applyResolution();
    }, OVERRIDE_CLEAR_DEFER_MS);
  }

  onResolutionChange(cb: (resolved: PatchSoundtrackId) => void): () => void {
    this.resolutionListeners.add(cb);
    return () => {
      this.resolutionListeners.delete(cb);
    };
  }

  getResolution(): PatchSoundtrackId {
    return this.currentResolution;
  }

  /**
   * Recompute the resolved patch. When it changes, fade the old patchBus to
   * silence over 250 ms and start the new patch at the 250 ms mark — a clean
   * fade-out / start, no overlap.
   */
  private applyResolution(): void {
    if (this.pendingResolutionTimer) {
      clearTimeout(this.pendingResolutionTimer);
      this.pendingResolutionTimer = null;
    }
    const next = resolveSoundtrack({
      scenario: this.scenario,
      soundtrack: this.soundtrack,
      overrides: this.overrides,
    });
    if (next === this.currentResolution) return;
    this.currentResolution = next;
    this.swapPatchBus();
    for (const cb of this.resolutionListeners) cb(next);
  }

  private swapPatchBus(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    // When the engine is currently silenced (master gain at 0 from mute or
    // suppression), the old patch hasn't been pre-scheduling audible events
    // — see scheduleLoop's silenced guard. Kill the old bus immediately and
    // let the new bus start at near-current time so audio begins cleanly the
    // moment silence releases. Otherwise apply the normal fade-out / start.
    const instant = this.silenced;
    if (this.patchBus) {
      const old = this.patchBus;
      const now = ctx.currentTime;
      old.gain.cancelScheduledValues(now);
      if (instant) {
        old.gain.setValueAtTime(0, now);
        setTimeout(() => {
          try { old.disconnect(); } catch { /* already disconnected */ }
        }, 50);
      } else {
        old.gain.setValueAtTime(old.gain.value, now);
        old.gain.linearRampToValueAtTime(0, now + FADE_OUT_SECONDS);
        setTimeout(() => {
          try { old.disconnect(); } catch { /* already disconnected */ }
        }, (FADE_OUT_SECONDS + 0.03) * 1000);
      }
    }
    const next = ctx.createGain();
    next.gain.value = 1;
    next.connect(this.master);
    this.patchBus = next;
    this.patchCursor = ctx.currentTime + (instant ? 0.05 : FADE_OUT_SECONDS);
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
        tone(523, 0.15, "sine", 0.10);
        tone(784, 0.11, "sine", 0.06, 0.04);
        break;
      case "bubble":
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

    this.currentResolution = resolveSoundtrack({
      scenario: this.scenario,
      soundtrack: this.soundtrack,
      overrides: this.overrides,
    });

    this.started = true;
    this.patchCursor = ctx.currentTime + 0.1;
    this.log.logAudio("engine:start", {
      silenced: this.silenced,
      soundtrack: this.soundtrack,
      resolved: this.currentResolution,
    });
    for (const cb of this.resolutionListeners) cb(this.currentResolution);
    this.scheduleLoop();
  }

  private scheduleLoop(): void {
    if (!this.started || !this.ctx) return;
    const lookahead = 0.4;
    // While silenced (mute or any suppression), don't pre-schedule patch
    // events into the audio graph — they'd become audible the instant
    // silence releases and tail past any subsequent override swap. Park the
    // cursor near current time so resumption schedules a fresh start.
    if (this.silenced) {
      this.patchCursor = this.ctx.currentTime + 0.05;
      this.scheduler = setTimeout(() => this.scheduleLoop(), 100);
      return;
    }
    const patch = PATCHES[this.currentResolution];
    if (patch && this.patchBus) {
      const loopSec = computeLoopSeconds(patch);
      if (loopSec > 0) {
        while (this.patchCursor < this.ctx.currentTime + lookahead) {
          scheduleOneLoop(this.ctx, this.patchBus, patch, this.patchCursor);
          this.patchCursor += loopSec;
        }
      }
    }
    this.scheduler = setTimeout(() => this.scheduleLoop(), 100);
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

/**
 * Display label for a resolved patch. Used by OptionsSheet's "Now Playing"
 * subtitle. Kept here so the source-of-truth song list stays colocated.
 */
export const SOUNDTRACK_LABELS: Record<PatchSoundtrackId, string> = {
  song4_day: "Day",
  song4_night: "Night",
  song6_vote: "Vote",
  song7_story: "Story",
  song8_trophy: "Trophy",
  song9_intro: "Hello",
  song10_credits: "Finale",
};


/**
 * Manual crash trigger — a developer aid for exercising the full-screen error
 * boundary (which plays the "bubble" pop and stops the soundtrack).
 *
 * A React error boundary only catches errors thrown during render, so typing
 * `throw` in the console does NOT trip it. Instead we flip an `armed` flag and
 * let the mounted <CrashOnDemand> guard throw whenever it renders while armed.
 *
 * The throw is a PURE read of `armed` — we never mutate during render. That
 * matters under concurrent React: a throw in a concurrent render is retried
 * synchronously, and the retry must reproduce the same error or React decides
 * it "recovered" and the boundary never shows. `armed` is only cleared by
 * `disarmCrash()`, which the boundary calls from `onReset` (i.e. on Retry),
 * before it re-renders its children — so the app recovers cleanly.
 */

import * as React from "react";

import { log } from "./debugLogger";

let armed = false;
const listeners = new Set<() => void>();

function subscribeCrash(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Arm the crash and nudge the guard to re-render (and throw). */
export function triggerCrash(): void {
  log("warn", "crashTrigger", "crash:triggered", "debug", { source: "manual" });
  armed = true;
  listeners.forEach((listener) => listener());
}

/** Clear the armed flag so the boundary's Retry re-renders children cleanly. */
export function disarmCrash(): void {
  armed = false;
}

/**
 * Renders nothing until crashed. Mount it inside the error boundary you want to
 * exercise; while armed it throws during render so that boundary's fallback shows.
 */
export function CrashOnDemand(): null {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => subscribeCrash(force), []);

  if (armed) {
    throw new Error("Manual crash (Traveler dev tool): exercising the error boundary.");
  }
  return null;
}

// Devtools affordance: call `window.tripcast.crash()` from the console.
if (typeof window !== "undefined") {
  window.tripcast = { ...(window.tripcast ?? {}), crash: triggerCrash };
}

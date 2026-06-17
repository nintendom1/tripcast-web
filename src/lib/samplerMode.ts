import { useSyncExternalStore } from "react";

export type SamplerMode = "legacy" | "relevant" | "precise";

const STORAGE_KEY = "tripcast.liveTrail.samplerMode";
const VALID_MODES: ReadonlySet<SamplerMode> = new Set(["legacy", "relevant", "precise"]);
const listeners = new Set<() => void>();

function readStored(): SamplerMode {
  if (typeof localStorage === "undefined") return "relevant";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw && VALID_MODES.has(raw as SamplerMode) ? (raw as SamplerMode) : "relevant";
  } catch {
    return "relevant";
  }
}

let cached: SamplerMode = readStored();

export function getSamplerMode(): SamplerMode {
  return cached;
}

export function setSamplerMode(mode: SamplerMode): void {
  if (cached === mode) return;
  cached = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // no-op when storage is unavailable
  }
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useSamplerMode(): SamplerMode {
  return useSyncExternalStore(subscribe, getSamplerMode, getSamplerMode);
}

export const SAMPLER_MODE_INFO: Record<SamplerMode, string> = {
  legacy:
    "Sparse: a breadcrumb every ~200m of movement or every 60s. Best for long drives or hikes where minimal points and maximum battery matter.",
  relevant:
    "Balanced: emits every 50m, every 2 minutes, or on sharp turns (≥22.5°). Default. Good for normal walking and city travel.",
  precise:
    "Fine detail: emits every 10m, every 60s, or on subtle turns (≥18°). Use for museums, parks, or tight loops (~15m). Produces ~5× more breadcrumbs; expect higher battery use.",
};

export const MAP_COOLDOWN_KEY = "tripcast.map_cooldown";
export const MAP_COOLDOWN_EVENT = "tripcast.mapCooldownChanged";
export const MAP_COOLDOWN_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000] as const;
export const MAP_COOLDOWN_STRIKE_RESET_MS = 60 * 60_000;

export type MapProxyBaseSource =
  | "override"
  | "convex-derived"
  | "local-dev"
  | "same-origin-dev"
  | "missing";

export type MapProxyBaseResolution = {
  baseUrl: string | null;
  source: MapProxyBaseSource;
  convexHost?: string;
};

export type MapCooldownState = {
  until: number | null;
  strikes: number;
  lastFailureAt: number | null;
  backoffMs: number | null;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function deriveConvexSiteUrl(convexUrl: string): MapProxyBaseResolution | null {
  const parsed = parseUrl(convexUrl);
  if (!parsed) return null;

  if (parsed.hostname === "127.0.0.1" && parsed.port === "3210") {
    parsed.port = "3211";
    return {
      baseUrl: trimTrailingSlash(parsed.toString()),
      source: "local-dev",
      convexHost: parsed.hostname,
    };
  }

  if (parsed.hostname.endsWith(".convex.cloud")) {
    parsed.hostname = parsed.hostname.replace(/\.convex\.cloud$/, ".convex.site");
    parsed.pathname = "";
    parsed.search = "";
    parsed.hash = "";
    return {
      baseUrl: trimTrailingSlash(parsed.toString()),
      source: "convex-derived",
      convexHost: parsed.hostname,
    };
  }

  return null;
}

export function getMapProxyBaseResolution(): MapProxyBaseResolution {
  const configured = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;
  if (configured?.trim()) {
    return {
      baseUrl: trimTrailingSlash(configured.trim()),
      source: "override",
    };
  }

  const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
  if (convexUrl?.trim()) {
    const derived = deriveConvexSiteUrl(convexUrl.trim());
    if (derived) return derived;
  }

  if (import.meta.env.DEV && typeof window !== "undefined") {
    return {
      baseUrl: trimTrailingSlash(window.location.origin),
      source: "same-origin-dev",
    };
  }

  return { baseUrl: null, source: "missing" };
}

export function getMapProxyBaseUrl(): string | null {
  return getMapProxyBaseResolution().baseUrl;
}

export function getMapStyleUrl(): string | null {
  const baseUrl = getMapProxyBaseUrl();
  if (!baseUrl) return null;
  return `${baseUrl}/map/style?base=${encodeURIComponent(baseUrl)}`;
}

export function getMapStyleResolution(style?: string): MapProxyBaseResolution & { styleUrl: string | null } {
  const resolution = getMapProxyBaseResolution();
  if (!resolution.baseUrl) {
    return { ...resolution, styleUrl: null };
  }
  const base = encodeURIComponent(resolution.baseUrl);
  const styleQuery = style ? `&style=${encodeURIComponent(style)}` : "";
  return {
    ...resolution,
    styleUrl: `${resolution.baseUrl}/map/style?base=${base}${styleQuery}`,
  };
}

// Flags a known map-proxy misconfiguration so it can be surfaced on-device.
// Convex HTTP actions (e.g. `/map/style`) are served only from `.convex.site`;
// a base resolved to a `.convex.cloud` host always 404s the basemap style.
export function getMapProxyConfigHint(resolution: MapProxyBaseResolution): string | null {
  if (!resolution.baseUrl) return null;
  const parsed = parseUrl(resolution.baseUrl);
  if (!parsed) return null;
  if (parsed.hostname.endsWith(".convex.cloud")) {
    return "Map proxy host ends in .cloud but must be .site.";
  }
  return null;
}

function normalizeCooldownState(value: unknown, now: number): MapCooldownState | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value > now
      ? {
          until: value,
          strikes: 1,
          lastFailureAt: now,
          backoffMs: Math.max(0, value - now),
        }
      : null;
  }

  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const until = typeof record.until === "number" && Number.isFinite(record.until)
    ? record.until
    : null;
  const strikes = typeof record.strikes === "number" && Number.isFinite(record.strikes)
    ? Math.max(0, Math.floor(record.strikes))
    : 0;
  const lastFailureAt = typeof record.lastFailureAt === "number" && Number.isFinite(record.lastFailureAt)
    ? record.lastFailureAt
    : null;
  const backoffMs = typeof record.backoffMs === "number" && Number.isFinite(record.backoffMs)
    ? Math.max(0, record.backoffMs)
    : null;

  if (until !== null && until <= now) {
    return {
      until: null,
      strikes,
      lastFailureAt,
      backoffMs: null,
    };
  }

  return { until, strikes, lastFailureAt, backoffMs };
}

export function readMapCooldownState(now = Date.now()): MapCooldownState {
  try {
    const raw = sessionStorage.getItem(MAP_COOLDOWN_KEY);
    if (!raw) {
      return { until: null, strikes: 0, lastFailureAt: null, backoffMs: null };
    }

    const parsed = raw.trim().startsWith("{") ? JSON.parse(raw) : Number(raw);
    const state = normalizeCooldownState(parsed, now);
    if (!state) {
      sessionStorage.removeItem(MAP_COOLDOWN_KEY);
      return { until: null, strikes: 0, lastFailureAt: null, backoffMs: null };
    }

    if (state.until === null && state.strikes === 0) {
      sessionStorage.removeItem(MAP_COOLDOWN_KEY);
    } else if (raw.trim().startsWith("{") && state.until === null) {
      sessionStorage.setItem(MAP_COOLDOWN_KEY, JSON.stringify(state));
    }
    return state;
  } catch {
    return { until: null, strikes: 0, lastFailureAt: null, backoffMs: null };
  }
}

function writeMapCooldownState(state: MapCooldownState): void {
  try {
    if (state.until === null && state.strikes === 0) {
      sessionStorage.removeItem(MAP_COOLDOWN_KEY);
    } else {
      sessionStorage.setItem(MAP_COOLDOWN_KEY, JSON.stringify(state));
    }
  } catch {
    // Storage can be unavailable in private browsing; in-memory state still handles this tab.
  }
}

function dispatchCooldownChanged(state: MapCooldownState): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(MAP_COOLDOWN_EVENT, {
      detail: {
        cooldownUntil: state.until,
        cooldown: state,
      },
    }));
  }
}

export function getActiveMapCooldown(now = Date.now()): number | null {
  return readMapCooldownState(now).until;
}

export function triggerMapCooldown(now = Date.now()): MapCooldownState {
  const previous = readMapCooldownState(now);
  const shouldReset = previous.lastFailureAt === null ||
    now - previous.lastFailureAt > MAP_COOLDOWN_STRIKE_RESET_MS;
  const strikes = shouldReset ? 1 : previous.strikes + 1;
  const backoffMs = MAP_COOLDOWN_BACKOFF_MS[Math.min(strikes - 1, MAP_COOLDOWN_BACKOFF_MS.length - 1)];
  const state: MapCooldownState = {
    until: now + backoffMs,
    strikes,
    lastFailureAt: now,
    backoffMs,
  };
  writeMapCooldownState(state);
  dispatchCooldownChanged(state);
  return state;
}

export function clearMapCooldown(now = Date.now()): MapCooldownState {
  const previous = readMapCooldownState(now);
  const state: MapCooldownState = {
    until: null,
    strikes: previous.strikes,
    lastFailureAt: previous.lastFailureAt,
    backoffMs: null,
  };
  writeMapCooldownState(state);
  dispatchCooldownChanged(state);
  return state;
}

export function resetMapCooldown(): MapCooldownState {
  const state: MapCooldownState = {
    until: null,
    strikes: 0,
    lastFailureAt: null,
    backoffMs: null,
  };
  writeMapCooldownState(state);
  dispatchCooldownChanged(state);
  return state;
}

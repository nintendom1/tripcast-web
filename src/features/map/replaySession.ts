import type {
  JournalEvent,
  LiveTrailReplayPage,
  LiveTrailSample,
  ReplayStoryPage,
  Role,
} from "../../convex/tripcastApi";

export const REPLAY_PAGE_SIZE = 64;
export const REPLAY_RECENT_PIN_TARGET = 50;
export const REPLAY_RESUME_LOOK_BEHIND = 8;
export const REPLAY_INITIAL_BUFFER_SECONDS = 10;
export const REPLAY_PREFETCH_SECONDS = 15;
export const REPLAY_TARGET_BUFFER_SECONDS = 25;

export type ReplaySourceMode = "recent" | "beginning" | "custom";
export type ReplaySource = {
  mode: ReplaySourceMode;
  startAt?: number;
  endAt: number;
};

export type ReplayPin = {
  eventId: string;
  occurredAt: number;
  lat: number;
  lon: number;
  kind: "checkpoint" | "breadcrumb";
  title?: string;
  imageId?: string;
  checkpointId?: string;
};

export type ReplayResume = {
  version: 2;
  eventId: string;
  index: number;
  occurredAt: number;
  source: ReplaySource;
};

export type ReplaySessionSnapshot = {
  pins: ReplayPin[];
  stories: JournalEvent[];
  breadcrumbs: LiveTrailSample[];
  hasMore: boolean;
  reachedTrueEnd: boolean;
  loading: boolean;
  error: string | null;
};

export type ReplayLoadReason = "initial" | "low-buffer" | "loaded-edge" | "next" | "retry" | "resume-search" | "resume-forward" | "manual";
export type ReplayLoadLogEntry = {
  action: "replay:load:session-start" | "replay:load:batch" | "replay:load:ready" | "replay:load:error";
  level: "info" | "error";
  details: Record<string, unknown>;
};
export type ReplayLoadLogger = (entry: ReplayLoadLogEntry) => void;

type Direction = "asc" | "desc";
type PageArgs = {
  startAt?: number;
  endAt?: number;
  direction: Direction;
  cursor: string | null;
};
type ReplayQueries = {
  breadcrumbs: (args: PageArgs) => Promise<LiveTrailReplayPage>;
  stories: (args: PageArgs) => Promise<ReplayStoryPage>;
};
type SourceScan<T> = {
  rows: T[];
  cursor: string | null;
  hasMore: boolean;
  trueEnd: boolean;
  boundary: number | null;
};

const resumeKey = (token: string) => `tripcast.replay.lastPin.${token}`;

export function readReplayResume(token: string): ReplayResume | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(resumeKey(token)) ?? "null") as Partial<ReplayResume> | null;
    if (!parsed || typeof parsed.eventId !== "string" || typeof parsed.index !== "number") return null;
    if (
      parsed.version !== 2 ||
      typeof parsed.occurredAt !== "number" ||
      !parsed.source ||
      typeof parsed.source.endAt !== "number"
    ) return null;
    return parsed as ReplayResume;
  } catch {
    return null;
  }
}

export function readLegacyReplayResume(token: string): { eventId: string; index: number } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(resumeKey(token)) ?? "null") as Record<string, unknown> | null;
    if (!parsed || typeof parsed.eventId !== "string" || typeof parsed.index !== "number") return null;
    return { eventId: parsed.eventId, index: parsed.index };
  } catch {
    return null;
  }
}

export function writeReplayResume(token: string, resume: ReplayResume) {
  try {
    localStorage.setItem(resumeKey(token), JSON.stringify(resume));
  } catch {
    // Resume is best-effort in private browsing and under storage pressure.
  }
}

export function clearReplayResume(token: string) {
  try {
    localStorage.removeItem(resumeKey(token));
  } catch {
    // ignore
  }
}

export function mergeReplayPins(stories: JournalEvent[], breadcrumbs: LiveTrailSample[]) {
  const pins: ReplayPin[] = stories.flatMap((event) => {
    if (
      event.type !== "story" ||
      typeof event.lat !== "number" ||
      !Number.isFinite(event.lat) ||
      typeof event.lon !== "number" ||
      !Number.isFinite(event.lon)
    ) return [];
    return [{
      eventId: event._id,
      occurredAt: event.occurredAt,
      lat: event.lat,
      lon: event.lon,
      kind: "checkpoint" as const,
      title: event.title,
      imageId: event.imageId,
      checkpointId: event.checkpointId,
    }];
  });
  let lastBreadcrumbAt = Number.NEGATIVE_INFINITY;
  for (const sample of [...breadcrumbs].sort((a, b) => a.sampledAt - b.sampledAt)) {
    if (!Number.isFinite(sample.lat) || !Number.isFinite(sample.lon)) continue;
    if (sample.sampledAt - lastBreadcrumbAt < 5_000) continue;
    pins.push({
      eventId: sample._id,
      occurredAt: sample.sampledAt,
      lat: sample.lat,
      lon: sample.lon,
      kind: "breadcrumb",
    });
    lastBreadcrumbAt = sample.sampledAt;
  }
  return [...new Map(pins.map((pin) => [pin.eventId, pin])).values()]
    .sort((a, b) => a.occurredAt - b.occurredAt || a.eventId.localeCompare(b.eventId));
}

export function estimateReplayBufferMs(
  pins: readonly ReplayPin[],
  playhead: number,
  speed: number,
  beatMs: (kind: ReplayPin["kind"], speed: number) => number,
  pinStep: (speed: number) => number,
) {
  let total = 0;
  let index = Math.max(0, playhead);
  const step = Math.max(1, pinStep(speed));
  while (index < pins.length - 1) {
    total += beatMs(pins[index]?.kind ?? "breadcrumb", speed);
    const target = Math.min(index + step, pins.length - 1);
    let next = target;
    for (let i = index + 1; i <= target; i += 1) {
      if (pins[i]?.kind === "checkpoint") {
        next = i;
        break;
      }
    }
    index = next;
  }
  return total;
}

type CacheEntry = { value: unknown; touchedAt: number; sessionKey: string };
type CacheResult<T> = { value: T; cache: "hit" | "miss" };
const pageCache = new Map<string, CacheEntry>();
let cacheIdentity = "";
let nextReplayLogSessionId = 1;

export function setReplayCacheIdentity(token: string, role: Role, cutoffAt: number | null) {
  const next = `${token}:${role}:${cutoffAt ?? "none"}`;
  if (cacheIdentity !== next) {
    cacheIdentity = next;
    pageCache.clear();
  }
}

function cacheKey(sessionKey: string, source: string, args: PageArgs) {
  return `${cacheIdentity}:${sessionKey}:${source}:${args.startAt ?? ""}:${args.endAt ?? ""}:${args.direction}:${args.cursor ?? ""}`;
}

async function cachedPage<T>(sessionKey: string, source: string, args: PageArgs, load: () => Promise<T>): Promise<CacheResult<T>> {
  const key = cacheKey(sessionKey, source, args);
  const cached = pageCache.get(key);
  if (cached) {
    cached.touchedAt = Date.now();
    return { value: cached.value as T, cache: "hit" };
  }
  const value = await load();
  pageCache.set(key, { value, touchedAt: Date.now(), sessionKey });
  const activeSessions = [...new Set([...pageCache.values()]
    .sort((a, b) => b.touchedAt - a.touchedAt)
    .map((entry) => entry.sessionKey))];
  const retained = new Set(activeSessions.slice(0, 4));
  for (const [entryKey, entry] of pageCache) {
    if (!retained.has(entry.sessionKey)) pageCache.delete(entryKey);
  }
  return { value, cache: "miss" };
}

export class ProgressiveReplaySession {
  private breadcrumbScan: SourceScan<LiveTrailSample> = { rows: [], cursor: null, hasMore: true, trueEnd: false, boundary: null };
  private storyScan: SourceScan<JournalEvent> = { rows: [], cursor: null, hasMore: true, trueEnd: false, boundary: null };
  private forwardRequest: Promise<ReplaySessionSnapshot> | null = null;
  private direction: Direction;
  private fetchStartAt?: number;
  private fetchEndAt: number;
  private batch = 0;
  private readonly logSessionId = nextReplayLogSessionId++;
  private state: ReplaySessionSnapshot = {
    pins: [], stories: [], breadcrumbs: [], hasMore: true, reachedTrueEnd: false, loading: false, error: null,
  };

  constructor(
    readonly sessionKey: string,
    readonly source: ReplaySource,
    private queries: ReplayQueries,
    private resumeAt?: number,
    legacyFallback = false,
    private readonly loadLogger?: ReplayLoadLogger,
  ) {
    this.direction = legacyFallback ? "asc" : source.mode === "recent" || resumeAt !== undefined ? "desc" : "asc";
    this.fetchStartAt = source.startAt;
    this.fetchEndAt = resumeAt ?? source.endAt;
  }

  snapshot() { return this.state; }

  async start(speed: number, beatMs: (kind: ReplayPin["kind"], speed: number) => number, pinStep: (speed: number) => number) {
    const startedAt = performance.now();
    this.emit("replay:load:session-start", "info", {
      sourceMode: this.source.mode,
      direction: this.direction,
      resume: this.resumeAt !== undefined,
      rangeSpanMs: this.source.startAt === undefined ? null : Math.max(0, this.source.endAt - this.source.startAt),
      speed,
      initialBufferMs: REPLAY_INITIAL_BUFFER_SECONDS * 1_000,
      prefetchBufferMs: REPLAY_PREFETCH_SECONDS * 1_000,
      targetBufferMs: REPLAY_TARGET_BUFFER_SECONDS * 1_000,
    });
    this.state = { ...this.state, loading: true, error: null };
    try {
      do {
        await this.fetchPair("initial");
      } while (
        this.state.hasMore &&
        (this.direction === "desc"
          ? this.state.pins.length < (this.resumeAt === undefined ? REPLAY_RECENT_PIN_TARGET : REPLAY_RESUME_LOOK_BEHIND + 1)
          : estimateReplayBufferMs(this.state.pins, 0, speed, beatMs, pinStep) < REPLAY_INITIAL_BUFFER_SECONDS * 1_000)
      );

      if (this.direction === "desc" && this.resumeAt !== undefined) {
        const oldest = this.state.pins[0]?.occurredAt ?? this.fetchEndAt;
        this.direction = "asc";
        this.fetchStartAt = Math.max(this.source.startAt ?? Number.NEGATIVE_INFINITY, oldest);
        this.fetchEndAt = this.source.endAt;
        this.breadcrumbScan.cursor = null;
        this.storyScan.cursor = null;
        this.breadcrumbScan.hasMore = true;
        this.storyScan.hasMore = true;
        this.breadcrumbScan.trueEnd = false;
        this.storyScan.trueEnd = false;
        await this.fetchPair("resume-forward");
      }
      if (this.source.mode === "recent" && this.resumeAt === undefined && this.direction === "desc") {
        this.state = { ...this.state, hasMore: false, reachedTrueEnd: true };
      }
      this.state = { ...this.state, loading: false };
      this.emit("replay:load:ready", "info", {
        durationMs: Math.round(performance.now() - startedAt),
        batches: this.batch,
        pins: this.state.pins.length,
        bufferedMs: estimateReplayBufferMs(this.state.pins, 0, speed, beatMs, pinStep),
        hasMore: this.state.hasMore,
        reachedTrueEnd: this.state.reachedTrueEnd,
      });
      return this.state;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.state = { ...this.state, loading: false, error: message };
      this.emit("replay:load:error", "error", {
        phase: "start",
        durationMs: Math.round(performance.now() - startedAt),
        batches: this.batch,
        message,
      });
      return this.state;
    }
  }

  loadMore(reason: ReplayLoadReason = "manual") {
    if (this.forwardRequest) return this.forwardRequest;
    if (!this.state.hasMore) return Promise.resolve(this.state);
    this.state = { ...this.state, loading: true, error: null };
    const startedAt = performance.now();
    this.forwardRequest = this.fetchPair(reason)
      .then(() => {
        this.state = { ...this.state, loading: false };
        return this.state;
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.state = { ...this.state, loading: false, error: message };
        this.emit("replay:load:error", "error", {
          phase: reason,
          durationMs: Math.round(performance.now() - startedAt),
          batches: this.batch,
          message,
        });
        return this.state;
      })
      .finally(() => { this.forwardRequest = null; });
    return this.forwardRequest;
  }

  private async fetchPair(reason: ReplayLoadReason) {
    const startedAt = performance.now();
    const batch = ++this.batch;
    const argsFor = (cursor: string | null): PageArgs => ({
      startAt: this.fetchStartAt,
      endAt: this.fetchEndAt,
      direction: this.direction,
      cursor,
    });
    const tasks: Array<Promise<void>> = [];
    const sources: Record<string, Record<string, unknown>> = {};
    if (this.breadcrumbScan.hasMore) {
      const args = argsFor(this.breadcrumbScan.cursor);
      tasks.push(cachedPage(this.sessionKey, "breadcrumbs", args, () => this.queries.breadcrumbs(args)).then(({ value: page, cache }) => {
        this.breadcrumbScan.rows = [...this.breadcrumbScan.rows, ...page.page];
        this.breadcrumbScan.cursor = page.continueCursor;
        this.breadcrumbScan.hasMore = page.hasMore;
        this.breadcrumbScan.trueEnd = page.reachedTrueEnd;
        this.breadcrumbScan.boundary = page.scanBoundaryAt;
        sources.breadcrumbs = {
          returned: page.page.length,
          total: this.breadcrumbScan.rows.length,
          cache,
          hasMore: page.hasMore,
          reachedTrueEnd: page.reachedTrueEnd,
        };
      }));
    }
    if (this.storyScan.hasMore) {
      const args = argsFor(this.storyScan.cursor);
      tasks.push(cachedPage(this.sessionKey, "stories", args, () => this.queries.stories(args)).then(({ value: page, cache }) => {
        this.storyScan.rows = [...this.storyScan.rows, ...page.page];
        this.storyScan.cursor = page.continueCursor;
        this.storyScan.hasMore = page.hasMore;
        this.storyScan.trueEnd = page.reachedTrueEnd;
        this.storyScan.boundary = page.scanBoundaryAt;
        sources.stories = {
          returned: page.page.length,
          total: this.storyScan.rows.length,
          cache,
          hasMore: page.hasMore,
          reachedTrueEnd: page.reachedTrueEnd,
        };
      }));
    }
    await Promise.all(tasks);
    const rebuild = this.rebuild();
    this.emit("replay:load:batch", "info", {
      batch,
      reason,
      direction: this.direction,
      durationMs: Math.round(performance.now() - startedAt),
      sources,
      candidatePins: rebuild.candidatePins,
      exposedPins: this.state.pins.length,
      withheldPins: rebuild.withheldPins,
      frontierDistanceFromEndMs: rebuild.frontierDistanceFromEndMs,
      hasMore: this.state.hasMore,
      reachedTrueEnd: this.state.reachedTrueEnd,
    });
  }

  private rebuild() {
    const allPins = mergeReplayPins(this.storyScan.rows, this.breadcrumbScan.rows);
    const boundaries = [this.breadcrumbScan, this.storyScan].map((scan) => {
      if (scan.boundary !== null) return scan.boundary;
      return this.direction === "asc" ? this.fetchEndAt : (this.fetchStartAt ?? Number.NEGATIVE_INFINITY);
    });
    const frontier = this.direction === "asc" ? Math.min(...boundaries) : Math.max(...boundaries);
    let pins = allPins.filter((pin) => this.direction === "asc" ? pin.occurredAt <= frontier : pin.occurredAt >= frontier);
    if (this.direction === "desc" && this.resumeAt === undefined && pins.length > REPLAY_RECENT_PIN_TARGET) {
      pins = pins.slice(-REPLAY_RECENT_PIN_TARGET);
    }
    const reachedTrueEnd = this.breadcrumbScan.trueEnd && this.storyScan.trueEnd;
    this.state = {
      pins,
      stories: this.storyScan.rows,
      breadcrumbs: this.breadcrumbScan.rows,
      hasMore: !reachedTrueEnd,
      reachedTrueEnd,
      loading: this.state.loading,
      error: null,
    };
    return {
      candidatePins: allPins.length,
      withheldPins: allPins.length - pins.length,
      frontierDistanceFromEndMs: Number.isFinite(frontier) ? Math.max(0, this.fetchEndAt - frontier) : null,
    };
  }

  private emit(action: ReplayLoadLogEntry["action"], level: ReplayLoadLogEntry["level"], details: Record<string, unknown>) {
    this.loadLogger?.({ action, level, details: { sessionId: this.logSessionId, ...details } });
  }
}

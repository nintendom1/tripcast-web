import { beforeEach, describe, expect, it, vi } from "vitest";

import type { JournalEvent, LiveTrailReplayPage, LiveTrailSample, ReplayStoryPage } from "../../convex/tripcastApi";
import {
  ProgressiveReplaySession,
  estimateReplayBufferMs,
  mergeReplayPins,
  readLegacyReplayResume,
  readReplayResume,
  setReplayCacheIdentity,
  writeReplayResume,
  type ReplaySource,
  type ReplayLoadLogEntry,
} from "./replaySession";

const source: ReplaySource = { mode: "beginning", startAt: 0, endAt: 10_000 };

function breadcrumb(index: number, sampledAt = index * 1_000): LiveTrailSample {
  return { _id: `breadcrumb-${index}`, lat: 47 + index / 100, lon: -122 - index / 100, sampledAt };
}

function story(index: number, occurredAt = index * 1_000): JournalEvent {
  return {
    _id: `story-${index}`,
    _creationTime: occurredAt,
    type: "story",
    narrativeLevel: "narrative",
    occurredAt,
    createdAt: occurredAt,
    lat: 48 + index / 100,
    lon: -123 - index / 100,
    title: `Story ${index}`,
  };
}

function breadcrumbPage(page: LiveTrailSample[], overrides: Partial<LiveTrailReplayPage> = {}): LiveTrailReplayPage {
  return {
    page,
    hasMore: false,
    reachedTrueEnd: true,
    continueCursor: "done",
    effectiveStartAt: 0,
    effectiveEndAt: 10_000,
    scanBoundaryAt: page.at(-1)?.sampledAt ?? 10_000,
    ...overrides,
  };
}

function storyPage(page: JournalEvent[], overrides: Partial<ReplayStoryPage> = {}): ReplayStoryPage {
  return {
    page,
    hasMore: false,
    reachedTrueEnd: true,
    continueCursor: "done",
    effectiveStartAt: 0,
    effectiveEndAt: 10_000,
    scanBoundaryAt: page.at(-1)?.occurredAt ?? 10_000,
    ...overrides,
  };
}

describe("replaySession", () => {
  beforeEach(() => {
    localStorage.clear();
    setReplayCacheIdentity(`token-${Math.random()}`, "traveler", null);
  });

  it("merges chronologically, removes duplicate IDs, and keeps checkpoints", () => {
    const pins = mergeReplayPins([story(2), story(2)], [breadcrumb(1), breadcrumb(3)]);
    expect(pins.map((pin) => [pin.eventId, pin.kind])).toEqual([
      ["breadcrumb-1", "breadcrumb"],
      ["story-2", "checkpoint"],
    ]);
  });

  it("estimates buffered playback without stepping past checkpoints", () => {
    const pins = mergeReplayPins([story(2)], [breadcrumb(1, 1_000), breadcrumb(3, 7_000), breadcrumb(4, 13_000)]);
    const buffered = estimateReplayBufferMs(pins, 0, 10, (kind) => kind === "checkpoint" ? 3_000 : 200, () => 3);
    expect(buffered).toBe(3_200);
  });

  it("exposes pins only through the frontier scanned by both sources", async () => {
    const logs: ReplayLoadLogEntry[] = [];
    const breadcrumbs = vi.fn()
      .mockResolvedValueOnce(breadcrumbPage([breadcrumb(1), breadcrumb(3, 7_000)], {
        hasMore: true, reachedTrueEnd: false, continueCursor: "b1", scanBoundaryAt: 7_000,
      }))
      .mockResolvedValueOnce(breadcrumbPage([breadcrumb(5, 9_000)], { scanBoundaryAt: 9_000 }));
    const stories = vi.fn()
      .mockResolvedValueOnce(storyPage([story(2)], {
        hasMore: true, reachedTrueEnd: false, continueCursor: "s1", scanBoundaryAt: 2_000,
      }))
      .mockResolvedValueOnce(storyPage([story(4, 8_000)], { scanBoundaryAt: 8_000 }));
    const session = new ProgressiveReplaySession("frontier", source, { breadcrumbs, stories }, undefined, false, (entry) => logs.push(entry));

    const initial = await session.start(1, () => 10_000, () => 1);
    expect(initial.pins.map((pin) => pin.occurredAt)).toEqual([1_000, 2_000]);
    expect(initial.hasMore).toBe(true);
    expect(logs.map((entry) => entry.action)).toEqual([
      "replay:load:session-start",
      "replay:load:batch",
      "replay:load:ready",
    ]);
    expect(logs[1].details).toMatchObject({
      batch: 1,
      reason: "initial",
      direction: "asc",
      candidatePins: 3,
      exposedPins: 2,
      withheldPins: 1,
      frontierDistanceFromEndMs: 8_000,
      sources: {
        breadcrumbs: { returned: 2, cache: "miss", hasMore: true },
        stories: { returned: 1, cache: "miss", hasMore: true },
      },
    });

    const initialBreadcrumbs = initial.breadcrumbs;
    const initialStories = initial.stories;
    const complete = await session.loadMore();
    expect(complete.pins.map((pin) => pin.occurredAt)).toEqual([1_000, 2_000, 7_000, 8_000]);
    expect(complete.reachedTrueEnd).toBe(true);
    expect(complete.breadcrumbs).not.toBe(initialBreadcrumbs);
    expect(complete.stories).not.toBe(initialStories);
    expect(initialBreadcrumbs.map((sample) => sample.sampledAt)).toEqual([1_000, 7_000]);
    expect(initialStories.map((event) => event.occurredAt)).toEqual([2_000]);
  });

  it("selects the latest 50 merged pins for Recent activity", async () => {
    const rows = Array.from({ length: 60 }, (_, index) => breadcrumb(index + 1, (index + 1) * 5_000));
    const session = new ProgressiveReplaySession("recent", { mode: "recent", endAt: 100_000 }, {
      breadcrumbs: vi.fn().mockResolvedValue(breadcrumbPage([...rows].reverse(), { scanBoundaryAt: 1_000 })),
      stories: vi.fn().mockResolvedValue(storyPage([], { scanBoundaryAt: 0 })),
    });
    const snapshot = await session.start(1, () => 200, () => 1);
    expect(snapshot.pins).toHaveLength(50);
    expect(snapshot.pins[0].eventId).toBe("breadcrumb-11");
    expect(snapshot.reachedTrueEnd).toBe(true);
  });

  it("retries a failed forward request and retains the playhead data", async () => {
    const breadcrumbs = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(breadcrumbPage([breadcrumb(1), breadcrumb(2)]));
    const stories = vi.fn().mockResolvedValue(storyPage([]));
    const session = new ProgressiveReplaySession("retry", source, { breadcrumbs, stories });
    const failed = await session.start(1, () => 10_000, () => 1);
    expect(failed.error).toBe("offline");
    const recovered = await session.loadMore();
    expect(recovered.error).toBeNull();
    expect(recovered.pins).toHaveLength(1);
  });

  it("reuses cached pages and clears them when token, role, or cutoff identity changes", async () => {
    const cachedLogs: ReplayLoadLogEntry[] = [];
    const breadcrumbs = vi.fn().mockResolvedValue(breadcrumbPage([breadcrumb(1), breadcrumb(2)]));
    const stories = vi.fn().mockResolvedValue(storyPage([]));
    const first = new ProgressiveReplaySession("cache", source, { breadcrumbs, stories });
    const second = new ProgressiveReplaySession("cache", source, { breadcrumbs, stories }, undefined, false, (entry) => cachedLogs.push(entry));
    await first.start(1, () => 10_000, () => 1);
    await second.start(1, () => 10_000, () => 1);
    expect(breadcrumbs).toHaveBeenCalledTimes(1);
    expect(cachedLogs.find((entry) => entry.action === "replay:load:batch")?.details).toMatchObject({
      sources: {
        breadcrumbs: { cache: "hit" },
        stories: { cache: "hit" },
      },
    });
    setReplayCacheIdentity("different-token", "traveler", null);
    const third = new ProgressiveReplaySession("cache", source, { breadcrumbs, stories });
    await third.start(1, () => 10_000, () => 1);
    expect(breadcrumbs).toHaveBeenCalledTimes(2);
  });

  it("logs progressive load errors without request cursors or row data", async () => {
    const logs: ReplayLoadLogEntry[] = [];
    const session = new ProgressiveReplaySession("error", source, {
      breadcrumbs: vi.fn().mockRejectedValue(new Error("offline")),
      stories: vi.fn().mockResolvedValue(storyPage([])),
    }, undefined, false, (entry) => logs.push(entry));

    await session.start(1, () => 10_000, () => 1);

    const error = logs.at(-1);
    expect(error).toMatchObject({
      action: "replay:load:error",
      level: "error",
      details: { phase: "start", batches: 1, message: "offline" },
    });
    expect(JSON.stringify(error)).not.toMatch(/cursor|token|latitude|longitude|breadcrumb-/);
  });

  it("persists versioned resume metadata while still reading legacy values", () => {
    writeReplayResume("token", {
      version: 2,
      eventId: "story-2",
      index: 3,
      occurredAt: 2_000,
      source,
    });
    expect(readReplayResume("token")).toMatchObject({ eventId: "story-2", index: 3, source });
    expect(readLegacyReplayResume("token")).toEqual({ eventId: "story-2", index: 3 });
  });
});

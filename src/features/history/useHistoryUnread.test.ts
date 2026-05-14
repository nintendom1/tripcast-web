import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useHistoryUnread } from "./useHistoryUnread";
import type { HistoryEvent } from "../../convex/tripcastApi";

const LAST_READ_KEY = "tripcast.historyLastReadAt";

function makeEvent(overrides: Partial<HistoryEvent> = {}): HistoryEvent {
  return {
    _id: overrides._id ?? "id1",
    _creationTime: 1000,
    type: "check_in",
    storyLevel: "story",
    occurredAt: 2000,
    createdAt: 2000,
    ...overrides,
  };
}

describe("useHistoryUnread", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns unreadCount 0 when no events", () => {
    const { result } = renderHook(() => useHistoryUnread([]));
    expect(result.current.unreadCount).toBe(0);
  });

  it("returns unreadCount 0 when lastReadAt is after all events", () => {
    localStorage.setItem(LAST_READ_KEY, String(9999));
    const events = [makeEvent({ occurredAt: 1000 }), makeEvent({ _id: "id2", occurredAt: 2000 })];
    const { result } = renderHook(() => useHistoryUnread(events));
    expect(result.current.unreadCount).toBe(0);
  });

  it("counts only story-level events after lastReadAt", () => {
    localStorage.setItem(LAST_READ_KEY, String(1500));
    const events = [
      makeEvent({ _id: "a", storyLevel: "story", occurredAt: 2000 }),
      makeEvent({ _id: "b", storyLevel: "activity", occurredAt: 2000 }),
      makeEvent({ _id: "c", storyLevel: "story", occurredAt: 1000 }),
    ];
    const { result } = renderHook(() => useHistoryUnread(events));
    expect(result.current.unreadCount).toBe(1);
  });

  it("counts all story events when lastReadAt is 0", () => {
    const events = [
      makeEvent({ _id: "a", storyLevel: "story", occurredAt: 500 }),
      makeEvent({ _id: "b", storyLevel: "story", occurredAt: 1000 }),
      makeEvent({ _id: "c", storyLevel: "activity", occurredAt: 1500 }),
    ];
    const { result } = renderHook(() => useHistoryUnread(events));
    expect(result.current.unreadCount).toBe(2);
  });

  it("markAllRead updates localStorage and zeroes unreadCount", () => {
    const events = [makeEvent({ occurredAt: 1000 })];
    const { result } = renderHook(() => useHistoryUnread(events));
    expect(result.current.unreadCount).toBe(1);

    act(() => {
      result.current.markAllRead();
    });

    expect(result.current.unreadCount).toBe(0);
    expect(Number(localStorage.getItem(LAST_READ_KEY))).toBeGreaterThan(0);
  });
});

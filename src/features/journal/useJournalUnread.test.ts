import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useJournalUnread } from "./useJournalUnread";
import type { JournalEvent } from "../../convex/tripcastApi";

const LAST_READ_KEY = "tripcast.journalLastReadAt";

function makeEvent(overrides: Partial<JournalEvent> = {}): JournalEvent {
  return {
    _id: overrides._id ?? "id1",
    _creationTime: 1000,
    type: "story",
    narrativeLevel: "narrative",
    occurredAt: 2000,
    createdAt: 2000,
    ...overrides,
  };
}

describe("useJournalUnread", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns unreadCount 0 when no events", () => {
    const { result } = renderHook(() => useJournalUnread([]));
    expect(result.current.unreadCount).toBe(0);
  });

  it("returns unreadCount 0 when lastReadAt is after all events", () => {
    localStorage.setItem(LAST_READ_KEY, String(9999));
    const events = [makeEvent({ occurredAt: 1000 }), makeEvent({ _id: "id2", occurredAt: 2000 })];
    const { result } = renderHook(() => useJournalUnread(events));
    expect(result.current.unreadCount).toBe(0);
  });

  it("counts only story-level events after lastReadAt", () => {
    localStorage.setItem(LAST_READ_KEY, String(1500));
    const events = [
      makeEvent({ _id: "a", narrativeLevel: "narrative", occurredAt: 2000 }),
      makeEvent({ _id: "b", narrativeLevel: "activity", occurredAt: 2000 }),
      makeEvent({ _id: "c", narrativeLevel: "narrative", occurredAt: 1000 }),
    ];
    const { result } = renderHook(() => useJournalUnread(events));
    expect(result.current.unreadCount).toBe(1);
  });

  it("counts all story events when lastReadAt is 0", () => {
    const events = [
      makeEvent({ _id: "a", narrativeLevel: "narrative", occurredAt: 500 }),
      makeEvent({ _id: "b", narrativeLevel: "narrative", occurredAt: 1000 }),
      makeEvent({ _id: "c", narrativeLevel: "activity", occurredAt: 1500 }),
    ];
    const { result } = renderHook(() => useJournalUnread(events));
    expect(result.current.unreadCount).toBe(2);
  });

  it("markAllRead updates localStorage and zeroes unreadCount", () => {
    const events = [makeEvent({ occurredAt: 1000 })];
    const { result } = renderHook(() => useJournalUnread(events));
    expect(result.current.unreadCount).toBe(1);

    act(() => {
      result.current.markAllRead();
    });

    expect(result.current.unreadCount).toBe(0);
    expect(Number(localStorage.getItem(LAST_READ_KEY))).toBeGreaterThan(0);
  });
});

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "../trips/tripTypes";
import { useMessagingUnread } from "./useMessagingUnread";

const NOW = new Date("2026-06-01T12:00:00Z").getTime();
const KEY = "tripcast.messagesLastReadAt";

type Latest = ReturnType<typeof useMessagingUnread>;

function Probe({ onRender }: { onRender: (value: Latest) => void }) {
  onRender(useMessagingUnread([], undefined, "traveler", "session"));
  return null;
}

function renderFor(tripId: string | null) {
  let latest: Latest | undefined;
  const view = (id: string | null) => (
    <TripContextTestProvider value={{ viewingTripId: id, viewingTrip: id ? { tripId: id, title: id } : null }}>
      <Probe onRender={(value) => { latest = value; }} />
    </TripContextTestProvider>
  );
  const result = render(view(tripId));
  return {
    get latest() { return latest!; },
    switchTo: (id: string | null) => result.rerender(view(id)),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("chat read marker per viewed trip", () => {
  it("with no viewed trip reads and writes today's key", () => {
    localStorage.setItem(KEY, "1000");
    const view = renderFor(null);
    expect(view.latest.lastReadAt).toBe(1000);
    act(() => view.latest.markAllRead());
    expect(localStorage.getItem(KEY)).toBe(String(NOW));
  });

  it("keeps two trips apart", () => {
    const view = renderFor("trip-a");
    act(() => view.latest.markAllRead());
    expect(localStorage.getItem(`${KEY}:trip-a`)).toBe(String(NOW));

    view.switchTo("trip-b");
    expect(view.latest.lastReadAt).toBe(0);

    view.switchTo("trip-a");
    expect(view.latest.lastReadAt).toBe(NOW);
  });
});

const legacy = { tripId: "trip-legacy", title: "Legacy", lifecycle: "in_progress" as const, isLegacy: true };

/** Marks everything read under `value`, returns the localStorage key it wrote. */
function markUnder(value: Partial<TripContextValue>): string {
  let latest: Latest | undefined;
  function Mark() {
    latest = useMessagingUnread([], undefined, "traveler", "session");
    return null;
  }
  render(
    <TripContextTestProvider value={value}>
      <Mark />
    </TripContextTestProvider>,
  );
  localStorage.clear();
  act(() => latest!.markAllRead());
  return Object.keys(localStorage)[0];
}

describe("chat read marker keeps today's key where nothing may reset", () => {
  const traveler = { role: "traveler" as const, multiTripEnabled: true };

  it("the Legacy Trip: a Traveler viewing it uses today's key", () => {
    expect(
      markUnder({ ...traveler, viewingTripId: "trip-legacy", viewingTrip: { tripId: "trip-legacy", title: "Legacy" }, currentTrip: { ...legacy, revision: 1, publishingEpoch: 1, epochStartedAt: 1, multiTripEnabled: true } }),
    ).toBe(KEY);
  });

  it("a Follower on the Legacy Trip uses today's key", () => {
    expect(
      markUnder({ role: "follower", multiTripEnabled: true, viewingTripId: "trip-legacy", viewingTrip: { tripId: "trip-legacy", title: "Legacy" }, followerTrip: legacy }),
    ).toBe(KEY);
  });

  it("two non-Legacy trips get their own keys, apart from today's key", () => {
    const keyA = markUnder({ ...traveler, viewingTripId: "trip-a", viewingTrip: { tripId: "trip-a", title: "A" } });
    const keyB = markUnder({ ...traveler, viewingTripId: "trip-b", viewingTrip: { tripId: "trip-b", title: "B" } });
    expect(keyA).toBe(`${KEY}:trip-a`);
    expect(keyB).toBe(`${KEY}:trip-b`);
  });

  it("multi-trip disabled (no viewed trip id) uses today's key", () => {
    expect(markUnder({ role: "traveler", multiTripEnabled: false, viewingTripId: null, viewingTrip: null })).toBe(KEY);
  });
});

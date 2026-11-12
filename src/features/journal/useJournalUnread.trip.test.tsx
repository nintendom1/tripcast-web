import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { useJournalUnread } from "./useJournalUnread";

const NOW = new Date("2026-06-01T12:00:00Z").getTime();
const KEY = "tripcast.journalLastReadAt";

type Latest = ReturnType<typeof useJournalUnread>;

function Probe({ onRender }: { onRender: (value: Latest) => void }) {
  onRender(useJournalUnread([]));
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

describe("journal read marker per viewed trip", () => {
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

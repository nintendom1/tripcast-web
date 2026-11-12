import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConvexError } from "convex/values";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import BulkImportSheet from "./BulkImportSheet";

const server = vi.hoisted(() => ({
  commits: [] as Array<Record<string, unknown>>,
  previews: [] as unknown[],
  commitError: null as unknown,
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const preview = {
    valid: true,
    maxEntries: 50,
    counts: { checkins: 1, transactions: 1, missions: 0, routeVotes: 0 },
    rows: [
      { index: 0, kind: "story", ref: "story:one", title: "Story one", links: [] },
      { index: 1, kind: "transaction", ref: "tx:one", title: "Coffee", detail: "USD 4", links: [] },
    ],
    errors: [],
  };
  return {
    useQuery: (ref: never, args: unknown) => {
      if (args === "skip") return undefined;
      if (getFunctionName(ref) === "bulkImport:previewBulkImport") server.previews.push(args);
      return preview;
    },
    useMutation: (ref: never) => (args: Record<string, unknown>) => {
      if (getFunctionName(ref) === "bulkImport:travelerBulkImport") server.commits.push(args);
      if (server.commitError) return Promise.reject(server.commitError);
      return Promise.resolve({
        imported: 2,
        counts: { checkins: 1, transactions: 1, missions: 0, mysteryMissions: 0, routeVotes: 0, tickerFacts: 0, tickerTips: 0, liveTrailSamples: 0 },
        idsByRef: {},
      });
    },
    useConvex: () => ({ query: vi.fn() }),
  };
});
vi.mock("../../providers/MusicProvider", () => ({ useMusicSafe: () => ({ sfx: vi.fn() }) }));
vi.mock("../../debug/useActiveUiContext", () => ({ useActiveUiContext: vi.fn() }));
vi.mock("../../debug/useDebugLogger", () => ({ useDebugLogger: () => ({ logUi: vi.fn(), error: vi.fn() }) }));
vi.mock("../../providers/BackgroundSaveProvider", () => ({ useBackgroundSave: () => ({ saves: [] }) }));

const sheet = (open: boolean): ReactElement => <BulkImportSheet open={open} token="tok" onOpenChange={vi.fn()} />;
const following = { ...travelerFollowingCurrent };
const privately = { ...travelerViewingPrivately };

async function validate() {
  fireEvent.change(await screen.findByLabelText(/bulk import json/i), { target: { value: '[{"kind":"story","title":"x"}]' } });
  await userEvent.click(screen.getByRole("button", { name: /validate/i }));
}

beforeEach(() => {
  server.commits = [];
  server.previews = [];
  server.commitError = null;
});

describe("BulkImportSheet with a viewed trip", () => {
  it("tells the trip context when the trip it imports into is gone, and not for other errors", async () => {
    const reportTripUnavailable = vi.fn();
    server.commitError = new ConvexError({ code: "trip_not_found", message: "That trip no longer exists." });
    render(<TripContextTestProvider value={{ ...privately, reportTripUnavailable }}>{sheet(true)}</TripContextTestProvider>);
    await validate();
    await userEvent.click(await screen.findByRole("button", { name: "Commit 2 Entries into Other Trip" }));
    await waitFor(() => expect(reportTripUnavailable).toHaveBeenCalledWith("trip-other"));
    expect(await screen.findByText(/That trip no longer exists|trip_not_found|Server Error/)).toBeInTheDocument();
    reportTripUnavailable.mockClear();
    server.commitError = new Error("boom");
    await userEvent.click(screen.getByRole("button", { name: "Commit 2 Entries into Other Trip" }));
    await waitFor(() => expect(server.commits).toHaveLength(2));
    expect(reportTripUnavailable).not.toHaveBeenCalled();
  });

  it("names the trip imported into in the title and on the confirm button, and sends it with the preview and the commit", async () => {
    render(<TripContextTestProvider value={privately}>{sheet(true)}</TripContextTestProvider>);
    expect(await screen.findByRole("heading", { name: "Bulk Import into Other Trip" })).toBeInTheDocument();
    await validate();
    const confirm = await screen.findByRole("button", { name: "Commit 2 Entries into Other Trip" });
    await userEvent.click(confirm);
    await waitFor(() => expect(server.commits).toHaveLength(1));
    expect(server.commits[0]).toMatchObject({ token: "tok", tripId: "trip-other" });
    expect(server.previews.at(-1)).toMatchObject({ tripId: "trip-other" });
  });

  it("an import started in private view goes to that trip even if the view changes while it runs", async () => {
    const view = render(<TripContextTestProvider value={privately}>{sheet(true)}</TripContextTestProvider>);
    await validate();
    const confirm = await screen.findByRole("button", { name: "Commit 2 Entries into Other Trip" });
    // Return to current before the commit is sent: the sheet still names, and writes to, the trip it opened on.
    view.rerender(<TripContextTestProvider value={following}>{sheet(true)}</TripContextTestProvider>);
    expect(screen.getByRole("heading", { name: "Bulk Import into Other Trip" })).toBeInTheDocument();
    await userEvent.click(confirm);
    await waitFor(() => expect(server.commits).toHaveLength(1));
    expect(server.commits[0].tripId).toBe("trip-other");
  });

  it("opened after the view changed (mounted closed before): imports into the trip shown", async () => {
    const view = render(<TripContextTestProvider value={following}>{sheet(false)}</TripContextTestProvider>);
    view.rerender(<TripContextTestProvider value={privately}>{sheet(false)}</TripContextTestProvider>);
    view.rerender(<TripContextTestProvider value={privately}>{sheet(true)}</TripContextTestProvider>);
    expect(await screen.findByRole("heading", { name: "Bulk Import into Other Trip" })).toBeInTheDocument();
    await validate();
    await userEvent.click(await screen.findByRole("button", { name: "Commit 2 Entries into Other Trip" }));
    await waitFor(() => expect(server.commits).toHaveLength(1));
    expect(server.commits[0].tripId).toBe("trip-other");
  });

  it("multi-trip disabled and no provider: today's title, button and request, no tripId", async () => {
    for (const value of [{ role: "traveler" as const, multiTripEnabled: false }, undefined]) {
      server.commits = [];
      server.previews = [];
      const body = sheet(true);
      const { unmount } = render(value ? <TripContextTestProvider value={value}>{body}</TripContextTestProvider> : body);
      expect(await screen.findByRole("heading", { name: "Bulk Import" })).toBeInTheDocument();
      await validate();
      await userEvent.click(await screen.findByRole("button", { name: "Commit 2 Entries" }));
      await waitFor(() => expect(server.commits).toHaveLength(1));
      expect(server.commits[0]).toEqual({ token: "tok", entries: [{ kind: "story", title: "x" }] });
      expect(server.previews.at(-1)).toEqual({ token: "tok", entries: [{ kind: "story", title: "x" }] });
      unmount();
    }
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import BulkExportSheet from "./BulkExportSheet";

const server = vi.hoisted(() => ({
  queries: [] as Array<{ name: string; args: unknown }>,
  clientCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  tripData: { timeZone: "UTC", entries: [{ kind: "checkin", ref: "c1" }] } as Record<string, unknown>,
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: never, args: unknown) => {
      const name = getFunctionName(ref);
      server.queries.push({ name, args });
      if (args === "skip") return undefined;
      if (name === "bulkImport:travelerExportTripData") return server.tripData;
      if (name === "bulkImport:travelerExportTickerMessages") return { entries: [] };
      return undefined;
    },
    useConvex: () => ({
      query: (ref: never, args: Record<string, unknown>) => {
        server.clientCalls.push({ name: getFunctionName(ref), args });
        return Promise.resolve({ page: [], isDone: true, continueCursor: null });
      },
    }),
  };
});
vi.mock("../../providers/MusicProvider", () => ({ useMusicSafe: () => ({ sfx: vi.fn() }) }));
vi.mock("../../debug/useActiveUiContext", () => ({ useActiveUiContext: vi.fn() }));
vi.mock("../../debug/useDebugLogger", () => ({ useDebugLogger: () => ({ logUi: vi.fn(), error: vi.fn() }) }));

const sheet = (open: boolean): ReactElement => <BulkExportSheet open={open} token="tok" onOpenChange={vi.fn()} />;
const following = { ...travelerFollowingCurrent };
const privately = { ...travelerViewingPrivately };
const live = (name: string) => server.queries.filter((q) => q.name === name && q.args !== "skip");

beforeEach(() => {
  server.queries = [];
  server.clientCalls = [];
  server.tripData = { timeZone: "UTC", entries: [{ kind: "checkin", ref: "c1" }] };
});

describe("BulkExportSheet with a viewed trip", () => {
  it("names the trip exported in the title and pins every read to it after the view changed before opening", async () => {
    const view = render(<TripContextTestProvider value={following}>{sheet(false)}</TripContextTestProvider>);
    view.rerender(<TripContextTestProvider value={privately}>{sheet(false)}</TripContextTestProvider>);
    view.rerender(<TripContextTestProvider value={privately}>{sheet(true)}</TripContextTestProvider>);
    expect(await screen.findByRole("heading", { name: "Bulk Export: Other Trip" })).toBeInTheDocument();
    await waitFor(() => expect(live("bulkImport:travelerExportTripData").length).toBeGreaterThan(0));
    const last = (name: string) => live(name).at(-1)?.args;
    expect(last("bulkImport:travelerExportTripData")).toMatchObject({ tripId: "trip-other" });
    expect(last("bulkImport:travelerExportTickerMessages")).toEqual({ token: "tok", tripId: "trip-other" });
    // The actions that export name the trip too.
    // The trip's own export and the ticker export both name it.
    expect(screen.getAllByRole("button", { name: "Download .json from Other Trip" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Copy JSON from Other Trip" })).toHaveLength(2);
  });

  it("keeps exporting the trip it opened on when the view changes while open", async () => {
    const user = userEvent.setup();
    const view = render(<TripContextTestProvider value={privately}>{sheet(true)}</TripContextTestProvider>);
    expect(await screen.findByRole("heading", { name: "Bulk Export: Other Trip" })).toBeInTheDocument();
    view.rerender(<TripContextTestProvider value={following}>{sheet(true)}</TripContextTestProvider>);
    expect(screen.getByRole("heading", { name: "Bulk Export: Other Trip" })).toBeInTheDocument();
    server.queries = [];
    await user.click(screen.getByRole("button", { name: /Prepare Photo ZIP/ }));
    await waitFor(() => expect(server.clientCalls.length).toBeGreaterThan(0));
    expect(server.clientCalls.every((call) => call.args.tripId === "trip-other")).toBe(true);
    expect(live("bulkImport:travelerExportTripData").every((q) => (q.args as { tripId?: string }).tripId === "trip-other")).toBe(true);
  });

  it("the ticker export and Photo ZIP name the trip when it is not the shared one, and only then", async () => {
    const current = { tripId: "trip-current", title: "Current Trip", lifecycle: "in_progress" as const, isLegacy: false, revision: 1, publishingEpoch: 1, epochStartedAt: 1, multiTripEnabled: true };
    server.tripData = { timeZone: "UTC", entries: [{ kind: "checkin", ref: "c1" }] };
    const other = render(<TripContextTestProvider value={{ ...privately, currentTrip: current }}>{sheet(true)}</TripContextTestProvider>);
    expect(await screen.findByRole("button", { name: "Prepare Photo ZIP from Other Trip" })).toBeInTheDocument();
    other.unmount();
    render(<TripContextTestProvider value={{ ...following, currentTrip: current }}>{sheet(true)}</TripContextTestProvider>);
    expect(await screen.findByRole("button", { name: "Prepare Photo ZIP" })).toBeInTheDocument();
  });

  it("says so when the server cut the export short, and names the kinds", async () => {
    server.tripData = { timeZone: "UTC", entries: [{ kind: "checkin", ref: "c1" }], truncated: true, truncatedKinds: ["liveTrail", "stories"] };
    render(<TripContextTestProvider value={privately}>{sheet(true)}</TripContextTestProvider>);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This export is incomplete");
    expect(alert).toHaveTextContent("liveTrail, stories");
  });

  it("shows no incomplete-export warning for a complete export", async () => {
    render(<TripContextTestProvider value={privately}>{sheet(true)}</TripContextTestProvider>);
    await waitFor(() => expect(document.body.textContent).toContain("items ready for export"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("multi-trip disabled and no provider: today's title and requests, no tripId", async () => {
    for (const value of [{ role: "traveler" as const, multiTripEnabled: false }, undefined]) {
      server.queries = [];
      const body = sheet(true);
      const { unmount } = render(value ? <TripContextTestProvider value={value}>{body}</TripContextTestProvider> : body);
      expect(await screen.findByRole("heading", { name: "Bulk Export" })).toBeInTheDocument();
      await waitFor(() => expect(live("bulkImport:travelerExportTripData").length).toBeGreaterThan(0));
      for (const q of server.queries.filter((q) => q.args !== "skip")) expect(q.args).not.toHaveProperty("tripId");
      expect(live("bulkImport:travelerExportTickerMessages").at(-1)?.args).toEqual({ token: "tok" });
      expect(screen.getAllByRole("button", { name: "Download .json" }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("button", { name: "Copy JSON" }).length).toBeGreaterThan(0);
      expect(screen.queryByRole("button", { name: /from / })).toBeNull();
      unmount();
    }
  });
});

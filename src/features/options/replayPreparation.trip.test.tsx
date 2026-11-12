import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import DeveloperMysteryPinSheet from "./DeveloperMysteryPinSheet";
import ReplayImagePreparationSheet from "./ReplayImagePreparationSheet";
import TrailCompressionReview from "./TrailCompressionReview";

const server = vi.hoisted(() => ({
  queries: [] as Array<{ name: string; args: unknown }>,
  clientCalls: [] as Array<{ kind: string; name: string; args: Record<string, unknown> }>,
  mutations: [] as Array<{ name: string; args: Record<string, unknown> }>,
  preparations: [] as Array<{ sources: string[]; tripTarget: unknown; tripClient: unknown }>,
  inventories: [] as unknown[],
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const manifest = { ended: true, ready: false, enabled: false, originalOnly: false, sourceRevision: "r1", compressionVersion: 1 };
  const client = {
    query: (ref: never, args: Record<string, unknown>) => {
      server.clientCalls.push({ kind: "query", name: getFunctionName(ref), args });
      return Promise.resolve({ points: [], day: null, cursor: null, done: true });
    },
    mutation: (ref: never, args: Record<string, unknown>) => {
      server.clientCalls.push({ kind: "mutation", name: getFunctionName(ref), args });
      return Promise.resolve(null);
    },
    action: vi.fn(),
  };
  return {
    useConvex: () => client,
    useQuery: (ref: never, args: unknown) => {
      const name = getFunctionName(ref);
      server.queries.push({ name, args });
      if (args === "skip") return undefined;
      if (name === "replayRoutes:manifest") return manifest;
      if (name === "mysteryMissions:travelerGetMysteryMissionSettings") return { enabled: true };
      if (name === "replayImages:preference") return { original: false };
      return undefined;
    },
    useMutation: (ref: never) => (args: Record<string, unknown>) => {
      server.mutations.push({ name: getFunctionName(ref), args });
      return Promise.resolve({ mysteryMissionId: "m1" });
    },
  };
});

vi.mock("../journal/replayImagePreparation", async () => {
  const actual = await vi.importActual<typeof import("../journal/replayImagePreparation")>("../journal/replayImagePreparation");
  return {
    ...actual,
    readPreparationInventory: vi.fn(async (_client: unknown, _token: string, trip?: { target: unknown }) => {
      server.inventories.push(trip?.target ?? null);
      return [{ source: "img-1", status: "pending", bytes: 1, previewBytes: 0 }];
    }),
    prepareReplayImages: vi.fn(async (_client: unknown, _token: string, sources: string[], _local: unknown, trip?: { target: unknown }) => {
      server.preparations.push({ sources, tripTarget: trip?.target ?? null, tripClient: trip ?? null });
    }),
  };
});
vi.mock("../map/TripMapStub", () => ({ default: () => null }));
vi.mock("./TrailCompressionMap", () => ({ default: () => null }));
vi.mock("../../debug/useActiveUiContext", () => ({ useActiveUiContext: vi.fn() }));
vi.mock("../../debug/useDebugLogger", () => ({ useDebugLogger: () => ({ logUi: vi.fn(), error: vi.fn() }) }));

async function prepareRemaining() {
  await userEvent.click(await screen.findByLabelText(/I have reviewed representative previews/));
  await userEvent.click(await screen.findByRole("button", { name: "Prepare remaining images" }));
}

const currentTrip = {
  tripId: "trip-current",
  title: "Current Trip",
  lifecycle: "in_progress" as const,
  isLegacy: false,
  revision: 1,
  publishingEpoch: 1,
  epochStartedAt: 1,
  multiTripEnabled: true,
};
const following = { ...travelerFollowingCurrent, currentTrip };
const privately = { ...travelerViewingPrivately, currentTrip };

beforeEach(() => {
  server.queries = [];
  server.clientCalls = [];
  server.mutations = [];
  server.preparations = [];
  server.inventories = [];
});

describe("ReplayImagePreparationSheet with a viewed trip", () => {
  const sheet = (open: boolean) => <ReplayImagePreparationSheet token="tok" open={open} onOpenChange={vi.fn()} />;

  it("prepares the trip shown when it opened, and names it", async () => {
    const view = render(<TripContextTestProvider value={following}>{sheet(false)}</TripContextTestProvider>);
    view.rerender(<TripContextTestProvider value={privately}>{sheet(false)}</TripContextTestProvider>);
    view.rerender(<TripContextTestProvider value={privately}>{sheet(true)}</TripContextTestProvider>);
    expect(await screen.findByTestId("trip-target-label")).toHaveTextContent("Other Trip");
    await waitFor(() => expect(server.inventories.length).toBeGreaterThan(0));
    expect(server.inventories.every((target) => (target as { tripId: string }).tripId === "trip-other")).toBe(true);
    await prepareRemaining();
    await waitFor(() => expect(server.preparations).toHaveLength(1));
    expect((server.preparations[0].tripTarget as { tripId: string }).tripId).toBe("trip-other");
  });

  it("a preparation that is running keeps its trip when the view changes", async () => {
    const view = render(<TripContextTestProvider value={privately}>{sheet(true)}</TripContextTestProvider>);
    await prepareRemaining();
    await waitFor(() => expect(server.preparations).toHaveLength(1));
    const started = server.preparations[0].tripClient as { target: { tripId: string } };
    view.rerender(<TripContextTestProvider value={following}>{sheet(true)}</TripContextTestProvider>);
    expect(started.target.tripId).toBe("trip-other");
    expect(screen.getByTestId("trip-target-label")).toHaveTextContent("Other Trip");
  });

  it("multi-trip disabled: no label and an untagged client", async () => {
    render(sheet(true));
    await prepareRemaining();
    await waitFor(() => expect(server.preparations).toHaveLength(1));
    expect(server.preparations[0].tripTarget).toBeNull();
    expect(screen.queryByTestId("trip-target-label")).toBeNull();
  });
});

describe("TrailCompressionReview with a viewed trip", () => {
  const review = (open: boolean) => <TrailCompressionReview token="tok" open={open} onOpenChange={vi.fn()} />;

  it("reads and writes the trip shown when it opened", async () => {
    const view = render(<TripContextTestProvider value={following}>{review(false)}</TripContextTestProvider>);
    view.rerender(<TripContextTestProvider value={privately}>{review(false)}</TripContextTestProvider>);
    view.rerender(<TripContextTestProvider value={privately}>{review(true)}</TripContextTestProvider>);
    expect((await screen.findAllByTestId("trip-target-label"))[0]).toHaveTextContent("Other Trip");
    expect(server.queries.find((q) => q.name === "replayRoutes:manifest")?.args).toEqual({ token: "tok", tripId: "trip-other" });
    // The view moves while the review is open; Enable still goes to the trip it shows.
    view.rerender(<TripContextTestProvider value={following}>{review(true)}</TripContextTestProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Use original trail" }));
    await waitFor(() => expect(server.clientCalls.some((call) => call.name === "replayRoutes:enable")).toBe(true));
    expect(server.clientCalls.find((call) => call.name === "replayRoutes:enable")?.args).toEqual({ token: "tok", enabled: false, tripId: "trip-other" });
    // Every preview page also names that trip.
    for (const call of server.clientCalls.filter((c) => c.name === "replayRoutes:preview")) expect(call.args.tripId).toBe("trip-other");
  });

  it("the nested image preparation uses the review's trip, not a fresh capture", async () => {
    const view = render(<TripContextTestProvider value={privately}>{review(true)}</TripContextTestProvider>);
    // The view moves before Images is tapped.
    view.rerender(<TripContextTestProvider value={following}>{review(true)}</TripContextTestProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Prepare images" }));
    await waitFor(() => expect(server.inventories.length).toBeGreaterThan(0));
    expect(server.inventories.every((target) => (target as { tripId: string } | null)?.tripId === "trip-other")).toBe(true);
  });

  it("multi-trip disabled: today's requests, no tripId", async () => {
    render(review(true));
    await userEvent.click(await screen.findByRole("button", { name: "Use original trail" }));
    await waitFor(() => expect(server.clientCalls.some((call) => call.name === "replayRoutes:enable")).toBe(true));
    expect(server.clientCalls.find((call) => call.name === "replayRoutes:enable")?.args).toEqual({ token: "tok", enabled: false });
    expect(server.queries.find((q) => q.name === "replayRoutes:manifest")?.args).toEqual({ token: "tok" });
    expect(screen.queryByTestId("trip-target-label")).toBeNull();
  });
});

describe("DeveloperMysteryPinSheet with a viewed trip", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: {
        getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 1, longitude: 2, accuracy: 5 } }),
      },
    });
    localStorage.setItem("tripcast.mystery.showAllPinsDebug", "true");
  });

  it("creates the test pin in the trip shown when it opened", async () => {
    const sheet = (open: boolean) => <DeveloperMysteryPinSheet open={open} token="tok" onOpenChange={vi.fn()} />;
    const view = render(<TripContextTestProvider value={following}>{sheet(false)}</TripContextTestProvider>);
    view.rerender(<TripContextTestProvider value={privately}>{sheet(true)}</TripContextTestProvider>);
    expect(await screen.findByTestId("trip-target-label")).toHaveTextContent("Other Trip");
    await userEvent.type(screen.getByLabelText(/Mystery pin text/i), "text");
    await userEvent.type(screen.getByLabelText(/spoken reveal/i), "intent");
    await userEvent.click(screen.getByRole("button", { name: "Create Test Mystery Pin" }));
    await waitFor(() => expect(server.mutations.length).toBeGreaterThan(0));
    const create = server.mutations.find((m) => m.name === "mysteryMissions:travelerCreateDeveloperTestMysteryMission");
    expect(create?.args).toMatchObject({ token: "tok", tripId: "trip-other" });
    expect(server.queries.find((q) => q.name === "mysteryMissions:travelerGetMysteryMissionSettings" && q.args !== "skip")?.args).toEqual({ token: "tok", tripId: "trip-other" });
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentTrip } from "../../convex/tripcastApi";
import type { StoredSession } from "../../lib/auth";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { ThemeProvider } from "../../providers/ThemeProvider";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import type { TripContextValue } from "../trips/tripTypes";
import { getLiveTrailCache, resetLiveTrailCachesForTests } from "../map/liveTrailCache";
import OptionsSheet from "./OptionsSheet";

type Call = { name: string; args: Record<string, unknown> };
const server = vi.hoisted(() => ({
  mutations: [] as Array<{ name: string; args: Record<string, unknown> }>,
  queries: [] as Array<{ name: string; args: unknown }>,
  data: {} as Record<string, unknown>,
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: (ref: never) => (args: Record<string, unknown>) => {
      const name = getFunctionName(ref);
      server.mutations.push({ name, args });
      return Promise.resolve(name.startsWith("liveTrail:") ? { deleted: 2 } : null);
    },
    useQuery: (ref: never, args: unknown) => {
      const name = getFunctionName(ref);
      server.queries.push({ name, args });
      return args === "skip" ? undefined : server.data[name];
    },
  };
});

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("maplibre-gl", () => {
  class MockMap {
    addSource = vi.fn();
    addLayer = vi.fn();
    getSource = vi.fn(() => null);
    setPaintProperty = vi.fn();
    resize = vi.fn();
    jumpTo = vi.fn();
    fitBounds = vi.fn();
    isStyleLoaded = vi.fn(() => true);
    remove = vi.fn();
    on() { return this; }
    once() { return this; }
  }
  class LngLatBounds {
    extend() { return this; }
    toArray() { return []; }
  }
  return { default: { Map: MockMap, LngLatBounds } };
});
vi.mock("../../components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetCloseButton: () => <button type="button">Close</button>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetBackButton: () => <button type="button">Back</button>,
}));
vi.mock("../followers/CreateInviteControl", () => ({ default: () => null }));
vi.mock("../privacy/EmergencyResetSheet", () => ({ EmergencyResetContent: () => null }));
vi.mock("../travelfunds/TravelFundsSheet", () => ({ default: () => null }));
vi.mock("./BulkImportSheet", () => ({ default: () => null }));
vi.mock("./BulkExportSheet", () => ({ default: () => null }));
vi.mock("../../debug/DebugPanel", () => ({ default: () => null }));

const session: StoredSession = { token: "test-token", role: "traveler", sessionType: "legacy", displayName: "Traveler" };
const current: CurrentTrip = {
  tripId: "trip-current",
  title: "Current Trip",
  lifecycle: "in_progress",
  isLegacy: false,
  revision: 1,
  publishingEpoch: 1,
  epochStartedAt: 1,
  multiTripEnabled: true,
};
const following: Partial<TripContextValue> = { ...travelerFollowingCurrent, currentTrip: current };
const privately: Partial<TripContextValue> = { ...travelerViewingPrivately, currentTrip: current };

const sheet = (trip: Partial<TripContextValue> | undefined, open: boolean, defaultView?: "follower-cutoff" | "quick-activities" | "live-trail" | "trip-ticker"): ReactElement => {
  const body = (
    <ThemeProvider>
      <OptionsSheet
        open={open}
        defaultView={defaultView}
        onOpenChange={vi.fn()}
        session={session}
        role="traveler"
        onSignOut={vi.fn()}
        onManageFollowers={vi.fn()}
        onReplayFollowerTour={vi.fn()}
        onLoggedOut={vi.fn()}
        onLocationDataCleared={vi.fn()}
        onTripDataDeleted={vi.fn()}
        onResetStarted={vi.fn()}
      />
    </ThemeProvider>
  );
  return trip ? <TripContextTestProvider value={trip}>{body}</TripContextTestProvider> : body;
};

/** Mounted closed while following the shared trip, then the Traveler views another trip and opens Options. */
function openAfterViewChanged(defaultView?: Parameters<typeof sheet>[2]) {
  const view = render(sheet(following, false, defaultView));
  view.rerender(sheet(privately, false, defaultView));
  view.rerender(sheet(privately, true, defaultView));
  return view;
}

const written = (name: string): Call | undefined => server.mutations.find((call) => call.name === name);

const samples = Array.from({ length: 5 }, (_, index) => ({
  _id: `sample-${index + 1}`,
  lat: 47.61 + index / 100,
  lon: -122.31 - index / 100,
  sampledAt: Date.UTC(2026, 4, 1, 16 + index),
}));

beforeEach(async () => {
  await resetLiveTrailCachesForTests();
  server.mutations = [];
  server.queries = [];
  server.data = {
    "travelerPreferences:travelerGetPreferences": {
      travelerTimeZone: "America/Los_Angeles",
      allowFollowersTripPath: false,
      followerContentCutoffEnabled: true,
      followerContentCutoffAt: 1_700_000_000_000,
    },
    "travelerPreferences:followerGetPreferences": { visible: true, travelerTimeZone: "UTC", allowFollowersTripPath: true },
    "missionSettings:travelerGetMissionSettings": { moderationMode: "manual_review", rateLimitPreset: "per_second" },
    "liveTrail:travelerGetLiveTrailStatus": { enabled: false, visibleToFollowers: false },
    "currentActivity:travelerGetQuickActivitySettings": { activities: [{ label: "Remote", emoji: "R" }], displayCount: 1, updatedAt: 1, updatedBySessionId: "s" },
    "mysteryMissions:travelerGetMysteryMissionSettings": { enabled: true, revealIntervalHours: 4, updatedAt: null },
    "mysteryMissions:travelerListMysteryMissions": { settings: { enabled: true, revealIntervalHours: 4 }, counts: { total: 0, signal: 0, dormant: 0, completed: 0, dismissed: 0 }, rows: [] },
    "mysteryMissions:travelerExportMysteryMissions": { version: 1, exportedAt: 0, missions: [] },
    "liveTrail:travelerPreviewLiveTrailDeleteRange": {
      startMs: Date.UTC(2026, 4, 1, 7),
      endExclusiveMs: Date.UTC(2026, 4, 2, 7),
      timeZone: "America/Los_Angeles",
      count: 5,
      samples,
    },
  };
  localStorage.clear();
  sessionStorage.clear();
});

describe("Options writes go to the trip shown when the section opened", () => {
  it("time zone", async () => {
    openAfterViewChanged();
    expect(screen.getAllByTestId("trip-target-label").some((el) => el.textContent === "Other Trip")).toBe(true);
    await userEvent.selectOptions(screen.getByLabelText("Change timezone"), "Asia/Tokyo");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(written("travelerPreferences:travelerSetTimeZone")).toBeDefined());
    expect(written("travelerPreferences:travelerSetTimeZone")?.args).toEqual({
      token: "test-token",
      timeZone: "Asia/Tokyo",
      source: "manual",
      tripId: "trip-other",
    });
    // The read that fills the form is pinned to that same trip.
    expect(server.queries.find((q) => q.name === "travelerPreferences:travelerGetPreferences")?.args).toMatchObject({ tripId: "trip-other" });
  });

  it("Follower path visibility", async () => {
    openAfterViewChanged();
    await userEvent.click(screen.getByLabelText(/Followers can see Trip Path/i));
    await waitFor(() => expect(written("travelerPreferences:travelerUpdatePreferences")).toBeDefined());
    expect(written("travelerPreferences:travelerUpdatePreferences")?.args).toEqual({
      token: "test-token",
      allowFollowersTripPath: true,
      tripId: "trip-other",
    });
  });

  it("Mystery Mission moderation", async () => {
    openAfterViewChanged();
    await userEvent.click(screen.getByLabelText(/Auto-publish/));
    await waitFor(() => expect(written("missionSettings:travelerUpdateMissionSettings")).toBeDefined());
    expect(written("missionSettings:travelerUpdateMissionSettings")?.args).toEqual({
      token: "test-token",
      moderationMode: "auto_publish",
      tripId: "trip-other",
    });
  });

  it("follower cutoff, and its 'now' shortcut is unavailable off the shared trip", async () => {
    openAfterViewChanged("follower-cutoff");
    expect(screen.getByTestId("trip-target-label")).toHaveTextContent("Other Trip");
    await userEvent.click(screen.getByLabelText(/Cutoff enabled/));
    await waitFor(() => expect(written("travelerPreferences:travelerUpdatePreferences")).toBeDefined());
    expect(written("travelerPreferences:travelerUpdatePreferences")?.args).toEqual({
      token: "test-token",
      followerContentCutoffEnabled: false,
      tripId: "trip-other",
    });
    expect(screen.getByRole("button", { name: "Use now as cutoff" })).toBeDisabled();
    expect(screen.getByText("Return to Current Trip to use now as the cutoff")).toBeInTheDocument();
  });

  it("'Use now as cutoff' stays available on the shared current trip", () => {
    render(sheet(following, true, "follower-cutoff"));
    expect(screen.getByRole("button", { name: "Use now as cutoff" })).toBeEnabled();
    expect(screen.queryByText(/Return to Current Trip/)).toBeNull();
    expect(screen.queryByTestId("trip-target-label")).toBeNull();
  });

  it("'Use now as cutoff' is not tied to the shared trip being in progress", () => {
    render(sheet({ ...following, currentTrip: { ...current, lifecycle: "completed" } }, true, "follower-cutoff"));
    expect(screen.getByRole("button", { name: "Use now as cutoff" })).toBeEnabled();
  });

  it("'Use now as cutoff' is decided from the trip written to, not the view: a privately viewed trip that became current", () => {
    render(sheet({ ...privately, currentTrip: { ...current, tripId: "trip-other", title: "Other Trip" } }, true, "follower-cutoff"));
    expect(screen.getByRole("button", { name: "Use now as cutoff" })).toBeEnabled();
    expect(screen.queryByTestId("trip-target-label")).toBeNull();
  });

  it("Quick Activities push", async () => {
    openAfterViewChanged("quick-activities");
    expect(screen.getByTestId("trip-target-label")).toHaveTextContent("Other Trip");
    await userEvent.click(screen.getByRole("button", { name: /Push/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Overwrite Backend" }));
    await waitFor(() => expect(written("currentActivity:travelerUpdateQuickActivitySettings")).toBeDefined());
    expect(written("currentActivity:travelerUpdateQuickActivitySettings")?.args).toMatchObject({ tripId: "trip-other" });
    expect(server.queries.find((q) => q.name === "currentActivity:travelerGetQuickActivitySettings")?.args).toEqual({
      token: "test-token",
      tripId: "trip-other",
    });
  });

  it("Live Trail recording", async () => {
    openAfterViewChanged("live-trail");
    expect(screen.getAllByTestId("trip-target-label")[0]).toHaveTextContent("Other Trip");
    await userEvent.click(screen.getAllByRole("checkbox")[0]);
    await waitFor(() => expect(written("liveTrail:travelerSetLiveTrailEnabled")).toBeDefined());
    expect(written("liveTrail:travelerSetLiveTrailEnabled")?.args).toMatchObject({ tripId: "trip-other" });
  });

  it("Trip Ticker", async () => {
    openAfterViewChanged("trip-ticker");
    expect(screen.getAllByTestId("trip-target-label")[0]).toHaveTextContent("Other Trip");
    await userEvent.click(screen.getByLabelText(/Enable Ticker/));
    await waitFor(() => expect(written("ticker:updateTickerSettings")).toBeDefined());
    expect(written("ticker:updateTickerSettings")?.args).toMatchObject({ tripId: "trip-other" });
  });

  it("Trip Ticker bulk import goes to the ticker's trip", async () => {
    openAfterViewChanged("trip-ticker");
    await userEvent.click(screen.getByRole("button", { name: "Bulk Import Tips" }));
    await userEvent.type(await screen.findByPlaceholderText(/Tip 1/), "Pack a battery");
    await userEvent.click(screen.getByRole("button", { name: /Import 1 Tips/ }));
    await waitFor(() => expect(written("bulkImport:travelerBulkImport")).toBeDefined());
    expect(written("bulkImport:travelerBulkImport")?.args).toMatchObject({ tripId: "trip-other", token: "test-token" });
  });

  it("Mystery Missions, opened after the view changed while Options was already open", async () => {
    // Options is open and its row (with the always-mounted Mystery Missions sheet) mounted while following.
    const view = render(sheet(following, true));
    view.rerender(sheet(privately, true));
    await userEvent.click(screen.getByRole("button", { name: /Mystery Missions/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Save interval" }));
    await waitFor(() => expect(written("mysteryMissions:travelerSetMysteryMissionsEnabled")).toBeDefined());
    expect(written("mysteryMissions:travelerSetMysteryMissionsEnabled")?.args).toMatchObject({ tripId: "trip-other" });
    expect(server.queries.filter((q) => q.name === "mysteryMissions:travelerListMysteryMissions" && q.args !== "skip").every((q) => (q.args as { tripId?: string }).tripId === "trip-other")).toBe(true);
  });
});

describe("Followers and the disabled state send exactly today's requests", () => {
  it("time zone: multi-trip disabled and no provider add no tripId", async () => {
    for (const trip of [{ role: "traveler" as const, multiTripEnabled: false }, undefined]) {
      server.mutations = [];
      const { unmount } = render(sheet(trip, true));
      expect(screen.queryByTestId("trip-target-label")).toBeNull();
      await userEvent.selectOptions(screen.getByLabelText("Change timezone"), "Asia/Tokyo");
      await userEvent.click(screen.getByRole("button", { name: "Apply" }));
      await waitFor(() => expect(written("travelerPreferences:travelerSetTimeZone")).toBeDefined());
      expect(written("travelerPreferences:travelerSetTimeZone")?.args).toEqual({ token: "test-token", timeZone: "Asia/Tokyo", source: "manual" });
      for (const q of server.queries.filter((q) => q.name === "travelerPreferences:travelerGetPreferences" && q.args !== "skip")) {
        expect(q.args).toEqual({ token: "test-token" });
      }
      unmount();
    }
  });

  it("follower cutoff: the disabled state sends no tripId and 'now' is never gated", async () => {
    render(sheet({ role: "traveler", multiTripEnabled: false }, true, "follower-cutoff"));
    expect(screen.getByRole("button", { name: "Use now as cutoff" })).toBeEnabled();
    await userEvent.click(screen.getByLabelText(/Cutoff enabled/));
    await waitFor(() => expect(written("travelerPreferences:travelerUpdatePreferences")).toBeDefined());
    expect(written("travelerPreferences:travelerUpdatePreferences")?.args).toEqual({ token: "test-token", followerContentCutoffEnabled: false });
  });

  it("map settings: a Follower reads the shared trip with no tripId and sees no labels", () => {
    const view = render(
      <TripContextTestProvider value={{ role: "follower", multiTripEnabled: false, viewingMode: "follow_current", viewingTripId: "trip-current", viewingTrip: { tripId: "trip-current", title: "Current Trip" } }}>
        <ThemeProvider>
          <OptionsSheet
            open
            onOpenChange={vi.fn()}
            session={{ ...session, role: "follower", sessionType: "follower", username: "f1" }}
            role="follower"
            onSignOut={vi.fn()}
            onManageFollowers={vi.fn()}
            onReplayFollowerTour={vi.fn()}
            onLoggedOut={vi.fn()}
            onLocationDataCleared={vi.fn()}
            onTripDataDeleted={vi.fn()}
            onResetStarted={vi.fn()}
          />
        </ThemeProvider>
      </TripContextTestProvider>,
    );
    const reads = server.queries.filter((q) => q.name === "travelerPreferences:followerGetPreferences" && q.args !== "skip");
    expect(reads.length).toBeGreaterThan(0);
    for (const q of reads) expect(q.args).toEqual({ token: "test-token" });
    expect(screen.queryByTestId("trip-target-label")).toBeNull();
    view.unmount();
  });

  it("live trail: the disabled state sends no tripId", async () => {
    render(sheet({ role: "traveler", multiTripEnabled: false }, true, "live-trail"));
    await userEvent.click(screen.getAllByRole("checkbox")[0]);
    await waitFor(() => expect(written("liveTrail:travelerSetLiveTrailEnabled")).toBeDefined());
    expect(written("liveTrail:travelerSetLiveTrailEnabled")?.args).toEqual({ token: "test-token", enabled: true });
  });
});

describe("Destructive actions name the trip and touch only that trip's data", () => {
  async function deleteEveryOther(name: string) {
    await userEvent.selectOptions(screen.getByLabelText(/Delete mode/i), "every_other");
    await userEvent.click(screen.getByRole("button", { name }));
    await waitFor(() => expect(written("liveTrail:travelerDeleteLiveTrailSamples")).toBeDefined());
  }

  it("deleting breadcrumbs from another trip names it, sends it, and leaves the cached live trail alone", async () => {
    const cache = getLiveTrailCache("test-token", "traveler");
    cache.replaceReplay(samples);
    openAfterViewChanged("live-trail");
    await deleteEveryOther("Delete 2 breadcrumbs from Other Trip");
    expect(written("liveTrail:travelerDeleteLiveTrailSamples")?.args).toEqual({
      token: "test-token",
      sampleIds: ["sample-2", "sample-4"],
      tripId: "trip-other",
    });
    expect(cache.snapshot().samples).toHaveLength(5);
  });

  it("deleting breadcrumbs from the shared current trip keeps today's text and updates the cache", async () => {
    const cache = getLiveTrailCache("test-token", "traveler");
    cache.replaceReplay(samples);
    render(sheet(following, true, "live-trail"));
    await deleteEveryOther("Delete 2 breadcrumbs");
    expect(cache.snapshot().samples.map((sample) => sample._id)).toEqual(["sample-1", "sample-3", "sample-5"]);
  });

  it("with multi-trip disabled the delete button and cache are today's", async () => {
    const cache = getLiveTrailCache("test-token", "traveler");
    cache.replaceReplay(samples);
    render(sheet({ role: "traveler", multiTripEnabled: false }, true, "live-trail"));
    await deleteEveryOther("Delete 2 breadcrumbs");
    expect(written("liveTrail:travelerDeleteLiveTrailSamples")?.args).toEqual({ token: "test-token", sampleIds: ["sample-2", "sample-4"] });
    expect(cache.snapshot().samples).toHaveLength(3);
  });

  it("a Mystery Mission delete confirmation names the trip", async () => {
    server.data["mysteryMissions:travelerListMysteryMissions"] = {
      settings: { enabled: true, revealIntervalHours: 4 },
      counts: { total: 1, signal: 1, dormant: 0, completed: 0, dismissed: 0 },
      rows: [{ _id: "mm-1", id: "m1", lat: 1, lon: 2, mysteryText: "text", trueIntent: "i", spawnRadiusMiles: 1, resolveRadiusMeters: 75, priority: 0 }],
    };
    const view = render(sheet(privately, true));
    await userEvent.click(screen.getByRole("button", { name: /Mystery Missions/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete this Mystery Mission from Other Trip?")).toBeInTheDocument();
    view.unmount();
    render(sheet({ role: "traveler", multiTripEnabled: false }, true));
    await userEvent.click(screen.getByRole("button", { name: /Mystery Missions/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete this Mystery Mission?")).toBeInTheDocument();
  });

  it("clearing the ticker names the trip", async () => {
    openAfterViewChanged("trip-ticker");
    await userEvent.click(screen.getByRole("button", { name: "Clear all messages" }));
    expect(screen.getByText("This removes every alert, fun fact, and tip from Other Trip.")).toBeInTheDocument();
  });

  it("clearing the ticker keeps today's text with multi-trip disabled", async () => {
    render(sheet({ role: "traveler", multiTripEnabled: false }, true, "trip-ticker"));
    await userEvent.click(screen.getByRole("button", { name: "Clear all messages" }));
    expect(screen.getByText("This removes every alert, fun fact, and tip.")).toBeInTheDocument();
  });
});

describe("Erase ALL trips entry", () => {
  it("the Danger Zone row says Erase ALL trips and still reads as the Emergency Reset", () => {
    render(sheet(following, true));
    expect(screen.getByRole("button", { name: /Erase ALL trips/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Emergency Reset/ })).toBeInTheDocument();
  });

  it("with multi-trip disabled the row is today's Emergency Reset", () => {
    render(sheet({ role: "traveler", multiTripEnabled: false }, true));
    expect(screen.getByRole("button", { name: /Emergency Reset/ })).toHaveTextContent("Wipe shared trip data");
    expect(screen.queryByRole("button", { name: /Erase ALL trips/ })).toBeNull();
  });
});

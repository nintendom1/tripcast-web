import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../convex/tripcastApi";
import type { CurrentTrip } from "../convex/tripcastApi";
import type { PendingSave } from "../lib/idb";
import type { TripContextValue } from "../features/trips/tripTypes";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../test/renderWithTrip";
import { BackgroundSaveProvider, isUnplacedSave, useBackgroundSave } from "./BackgroundSaveProvider";
import { TripContextTestProvider } from "./TripContextProvider";
import { setNativePublishingTags } from "../native/nativePublishingSignal";
import { prepareUploadedReplayImage } from "../features/journal/replayImagePreparation";

// A developer's .env.local may turn on the provider's latency and failure simulation; tests need it off.
vi.hoisted(() => {
  vi.stubEnv("VITE_BG_SAVE_SLOW_MS", "0");
  vi.stubEnv("VITE_BG_SAVE_FAIL_RATE", "0");
  vi.stubEnv("VITE_BG_SAVE_LINK_FAIL_RATE", "0");
});

// In-memory stand-in for IndexedDB: records are copied on write and read, like a real store.
const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock("../lib/idb", () => ({
  savePendingSave: vi.fn(async (save: { id: string }) => void store.set(save.id, { ...save })),
  deletePendingSave: vi.fn(async (id: string) => void store.delete(id)),
  getAllPendingSaves: vi.fn(async () => Array.from(store.values()).map((s) => ({ ...s }))),
}));
vi.mock("@capacitor/core", () => ({
  registerPlugin: () => ({ isAvailable: () => Promise.resolve({ value: false }) }),
}));
vi.mock("convex/react", () => ({ useMutation: vi.fn(), useQuery: vi.fn(), useConvex: vi.fn() }));
vi.mock("../features/journal/replayImagePreparation", () => ({ prepareUploadedReplayImage: vi.fn() }));
vi.mock("../features/journal/storyImageUpload", () => ({
  uploadStoryImage: vi.fn(async () => ({ storageId: "img-1", width: 10, height: 20 })),
}));

const CURRENT: CurrentTrip = {
  tripId: "trip-current",
  title: "Current Trip",
  lifecycle: "in_progress",
  isLegacy: false,
  revision: 1,
  publishingEpoch: 1,
  epochStartedAt: 0,
  multiTripEnabled: true,
};
const OTHER = { tripId: "trip-other", title: "Other Trip" };
const NEW_SHARED: CurrentTrip = { ...CURRENT, tripId: "trip-new", title: "New Shared Trip" };

const onCurrent: Partial<TripContextValue> = { ...travelerFollowingCurrent, currentTrip: CURRENT, serverTripStatus: "known" };
const onOther: Partial<TripContextValue> = { ...travelerViewingPrivately, currentTrip: CURRENT, serverTripStatus: "known" };
const sharedChanged: Partial<TripContextValue> = {
  ...travelerFollowingCurrent,
  viewingTripId: "trip-new",
  viewingTrip: { tripId: "trip-new", title: "New Shared Trip" },
  currentTrip: NEW_SHARED,
  serverTripStatus: "known",
};

const DATA: PendingSave["data"] = {
  showInStory: true,
  lat: 1,
  lon: 2,
  imageSize: "medium",
  source: "manual",
  title: "Pin",
};

let api: ReturnType<typeof useBackgroundSave>;
function Probe() {
  api = useBackgroundSave();
  return (
    <div data-testid="state">
      {api.saves.map((s) => `${s.id}:${s.status}:${s.tripId ?? "none"}:${s.error ?? ""}`).join("|")}
      {api.notices.map((n) => `notice:${n.message}`).join("|")}
    </div>
  );
}

const addCheckpoint = vi.fn();
const completeMission = vi.fn();
const updateTransaction = vi.fn();
const generateUploadUrl = vi.fn();
const resolveTripAt = vi.fn();
const convexClient = { query: vi.fn(), mutation: vi.fn(), action: vi.fn() };
const reportTripUnavailable = vi.fn();

function tree(value: Partial<TripContextValue> | null) {
  const provider = (
    <BackgroundSaveProvider token="t">
      <Probe />
    </BackgroundSaveProvider>
  );
  return value === null ? (
    provider
  ) : (
    <TripContextTestProvider value={{ reportTripUnavailable, ...value }}>{provider}</TripContextTestProvider>
  );
}

// Renders, then lets the provider finish loading the queue from the store, as it has long done by the time a form saves.
async function mount(value: Partial<TripContextValue> | null) {
  const view = render(tree(value));
  await act(async () => {});
  return view;
}

function seed(save: Partial<PendingSave>) {
  const full = { id: "old", data: DATA, status: "saving", progress: 0, createdAt: 1234, retryCount: 0, ...save };
  store.set(full.id as string, full);
}

const sentArgs = () => addCheckpoint.mock.calls.map((call) => call[0] as Record<string, unknown>);

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  setNativePublishingTags(null);
  addCheckpoint.mockResolvedValue("cp-1");
  completeMission.mockResolvedValue("cp-2");
  updateTransaction.mockResolvedValue(null);
  generateUploadUrl.mockResolvedValue("https://upload.invalid/u");
  resolveTripAt.mockResolvedValue({ tripId: "trip-old" });
  convexClient.query.mockImplementation((ref: unknown, args: unknown) =>
    ref === tripcastApi.trips.resolveTripAt ? resolveTripAt(args) : Promise.resolve(null),
  );
  vi.mocked(convexReact.useConvex).mockReturnValue(convexClient as never);
  vi.mocked(convexReact.useMutation).mockImplementation(((ref: unknown) => {
    if (ref === tripcastApi.checkpoints.addCheckpoint) return addCheckpoint;
    if (ref === tripcastApi.missions.travelerCompleteMissionAsStory) return completeMission;
    if (ref === tripcastApi.travelFunds.travelerUpdateTransaction) return updateTransaction;
    if (ref === tripcastApi.checkpoints.generateStoryImageUploadUrl) return generateUploadUrl;
    return vi.fn();
  }) as never);
});

describe("BackgroundSaveProvider with trips", () => {
  it("stamps the trip it was opened on and sends a retried save there after the view and the shared trip change", async () => {
    addCheckpoint.mockRejectedValueOnce(new Error("offline"));
    const { rerender } = await mount(onOther);
    await act(async () => {
      await api.startSave(DATA, undefined, undefined, OTHER);
    });
    await waitFor(() => expect(screen.getByTestId("state").textContent).toContain(":failed:trip-other:"));
    expect(sentArgs()[0]).toMatchObject({ tripId: "trip-other" });
    const [stored] = Array.from(store.values());
    expect(stored).toMatchObject({ tripId: "trip-other", tripTitle: "Other Trip" });

    // The Traveler returns to the shared trip, then another device changes the shared trip.
    rerender(tree(onCurrent));
    rerender(tree(sharedChanged));
    await act(async () => {
      await api.retrySave(api.saves[0].id);
    });
    await waitFor(() => expect(addCheckpoint).toHaveBeenCalledTimes(2));
    expect(sentArgs()[1]).toMatchObject({ tripId: "trip-other" });
    expect(sentArgs().map((a) => a.tripId)).toEqual(["trip-other", "trip-other"]);
    await waitFor(() => expect(store.size).toBe(0));
  });

  it("defaults to the trip on screen at enqueue time when the caller passes none", async () => {
    const { rerender } = await mount(onOther);
    await act(async () => {
      await api.startSave(DATA);
    });
    rerender(tree(onCurrent));
    await waitFor(() => expect(addCheckpoint).toHaveBeenCalled());
    expect(sentArgs()[0]).toMatchObject({ tripId: "trip-other" });
  });

  it("sends a save reloaded from IndexedDB to its stored trip, not the trip on screen", async () => {
    seed({ id: "reloaded", tripId: "trip-other", tripTitle: "Other Trip", status: "saving" });
    await mount(sharedChanged);
    await waitFor(() => expect(addCheckpoint).toHaveBeenCalledTimes(1));
    expect(sentArgs()[0]).toMatchObject({ tripId: "trip-other" });
    expect(resolveTripAt).not.toHaveBeenCalled();
  });

  it("keeps a failed save's trip across a reload of the queue", async () => {
    addCheckpoint.mockRejectedValueOnce(new Error("offline"));
    const first = await mount(onOther);
    await act(async () => {
      await api.startSave(DATA, undefined, undefined, OTHER);
    });
    await waitFor(() => expect(screen.getByTestId("state").textContent).toContain(":failed:"));
    first.unmount();

    await mount(onCurrent);
    await waitFor(() => expect(screen.getByTestId("state").textContent).toContain(":failed:trip-other:"));
    await act(async () => {
      await api.retrySave(api.saves[0].id);
    });
    await waitFor(() => expect(addCheckpoint).toHaveBeenCalledTimes(2));
    expect(sentArgs()[1]).toMatchObject({ tripId: "trip-other" });
  });

  it("resolves an untagged older save once through resolveTripAt with its own time and stores the answer", async () => {
    addCheckpoint.mockRejectedValueOnce(new Error("offline"));
    seed({ id: "old", status: "saving", createdAt: 1234 });
    await mount(onCurrent);
    await waitFor(() => expect(screen.getByTestId("state").textContent).toContain(":failed:trip-old:"));
    expect(resolveTripAt).toHaveBeenCalledTimes(1);
    expect(resolveTripAt).toHaveBeenCalledWith({ token: "t", at: 1234 });
    expect(store.get("old")).toMatchObject({ tripId: "trip-old" });
    expect(sentArgs()[0]).toMatchObject({ tripId: "trip-old" });

    await act(async () => {
      await api.retrySave("old");
    });
    await waitFor(() => expect(addCheckpoint).toHaveBeenCalledTimes(2));
    expect(sentArgs()[1]).toMatchObject({ tripId: "trip-old" });
    expect(resolveTripAt).toHaveBeenCalledTimes(1);
  });

  it("keeps and surfaces an untagged save that resolves to no trip instead of sending it", async () => {
    resolveTripAt.mockResolvedValue(null);
    seed({ id: "old", status: "saving" });
    await mount(onCurrent);
    await waitFor(() => expect(screen.getByTestId("state").textContent).toContain(":failed:none:Couldn't tell which trip"));
    expect(addCheckpoint).not.toHaveBeenCalled();
    expect(store.has("old")).toBe(true);
    expect(store.get("old")?.nextRetryAt).toBeUndefined();
  });

  it("waits, rather than sending untagged, while a multi-trip device's trip state is still loading", async () => {
    setNativePublishingTags({ tripId: "trip-current", publishingEpoch: 1, tripTitle: "Current Trip" });
    seed({ id: "old", status: "saving" });
    await mount({ ...travelerFollowingCurrent, multiTripEnabled: false, serverTripStatus: "loading" });
    await waitFor(() => expect(screen.getByTestId("state").textContent).toContain("Waiting to learn which trip"));
    expect(addCheckpoint).not.toHaveBeenCalled();
    expect(resolveTripAt).not.toHaveBeenCalled();
  });

  it("keeps waiting while the subscription is failing on a multi-trip device", async () => {
    setNativePublishingTags({ tripId: "trip-current", publishingEpoch: 1, tripTitle: "Current Trip" });
    seed({ id: "old", status: "saving" });
    await mount({ ...travelerFollowingCurrent, multiTripEnabled: false, serverTripStatus: "unavailable" });
    await waitFor(() => expect(screen.getByTestId("state").textContent).toContain("Waiting to learn which trip"));
    expect(addCheckpoint).not.toHaveBeenCalled();
  });

  it("sends an interrupted untagged save at once at a disabled cold start, with no failure shown", async () => {
    seed({ id: "old", status: "saving" });
    await mount({ multiTripEnabled: false, serverTripStatus: "loading" });
    await waitFor(() => expect(addCheckpoint).toHaveBeenCalledTimes(1));
    expect(sentArgs()[0]).not.toHaveProperty("tripId");
    expect(screen.getByTestId("state").textContent).not.toContain("Waiting");
    expect(resolveTripAt).not.toHaveBeenCalled();
  });

  it("sends an untagged save at once while the subscription is failing when the device was never multi-trip", async () => {
    seed({ id: "old", status: "saving" });
    await mount({ multiTripEnabled: false, serverTripStatus: "unavailable" });
    await waitFor(() => expect(addCheckpoint).toHaveBeenCalledTimes(1));
    expect(sentArgs()[0]).not.toHaveProperty("tripId");
  });

  it("sends an older untagged save that already has its Story as an untagged expense update, never placing it", async () => {
    seed({
      id: "old",
      status: "saving",
      checkpointId: "cp-old",
      data: { ...DATA, stagedTransactionIds: ["tx-1"] },
    });
    await mount(onCurrent);
    await waitFor(() => expect(convexClient.mutation).toHaveBeenCalled());
    expect(convexClient.mutation).toHaveBeenCalledWith(tripcastApi.travelFunds.travelerUpdateTransaction, {
      token: "t",
      transactionId: "tx-1",
      linkedCheckpointId: "cp-old",
    });
    expect(resolveTripAt).not.toHaveBeenCalled();
    expect(addCheckpoint).not.toHaveBeenCalled();
    expect(updateTransaction).not.toHaveBeenCalled();
  });

  it("removes a save whose trip was deleted, names the trip and reports it", async () => {
    addCheckpoint.mockRejectedValueOnce({ data: { code: "trip_not_found", message: "gone" } });
    await mount(onOther);
    await act(async () => {
      await api.startSave(DATA, undefined, undefined, OTHER);
    });
    await waitFor(() => expect(screen.getByTestId("state").textContent).toContain("notice:"));
    expect(screen.getByTestId("state").textContent).toContain("Other Trip");
    expect(api.saves).toHaveLength(0);
    expect(store.size).toBe(0);
    expect(reportTripUnavailable).toHaveBeenCalledWith("trip-other");
  });

  it("sends exactly today's arguments with multi-trip disabled (no tripId key)", async () => {
    await mount({ multiTripEnabled: false, serverTripStatus: "known" });
    await act(async () => {
      await api.startSave(DATA);
    });
    await waitFor(() => expect(addCheckpoint).toHaveBeenCalled());
    expect(Object.keys(sentArgs()[0]).sort()).toEqual(
      [
        "token", "source", "lat", "lon", "title", "note", "locationLabel", "showInStory", "imageSize", "imageId",
        "imageWidth", "imageHeight", "happenedAt", "missionId", "moodValue", "energyLevel", "stomachLevel",
        "stressLevel", "schedulePressureLevel", "statusNote",
      ].sort(),
    );
    expect(resolveTripAt).not.toHaveBeenCalled();
  });

  it("sends an untagged save with no provider as today, with no tripId", async () => {
    await mount(null);
    await act(async () => {
      await api.startSave(DATA);
    });
    await waitFor(() => expect(addCheckpoint).toHaveBeenCalled());
    expect(sentArgs()[0]).not.toHaveProperty("tripId");
  });

  it("names the stored trip on a mission completion and on transaction linking", async () => {
    await mount(onCurrent);
    await act(async () => {
      await api.startSave(
        { ...DATA, missionId: "m-1", stagedTransactionIds: ["tx-1"] },
        undefined,
        undefined,
        OTHER,
      );
    });
    await waitFor(() => expect(updateTransaction).toHaveBeenCalled());
    expect(completeMission).toHaveBeenCalledWith(expect.objectContaining({ missionId: "m-1", tripId: "trip-other" }));
    expect(updateTransaction).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "tx-1", tripId: "trip-other" }));
    expect(addCheckpoint).not.toHaveBeenCalled();
  });

  it("prepares the replay image on the save's trip", async () => {
    await mount(onCurrent);
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    await act(async () => {
      await api.startSave(DATA, { file, width: 10, height: 20, alreadyCompressed: true } as never, undefined, OTHER);
    });
    await waitFor(() => expect(prepareUploadedReplayImage).toHaveBeenCalled());
    const [, , source, tripClient] = vi.mocked(prepareUploadedReplayImage).mock.calls[0];
    expect(source).toBe("img-1");
    await (tripClient as { mutation: (ref: unknown, args: object) => Promise<unknown> }).mutation(
      tripcastApi.checkpoints.addCheckpoint,
      { token: "t" },
    );
    expect(convexClient.mutation).toHaveBeenCalledWith(tripcastApi.checkpoints.addCheckpoint, { token: "t", tripId: "trip-other" });
  });

  it("prepares the replay image untagged for a save with no trip", async () => {
    await mount(null);
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    await act(async () => {
      await api.startSave(DATA, { file, width: 10, height: 20, alreadyCompressed: true } as never);
    });
    await waitFor(() => expect(prepareUploadedReplayImage).toHaveBeenCalled());
    expect(vi.mocked(prepareUploadedReplayImage).mock.calls[0][3]).toBeUndefined();
  });

  it("names the trip in a failure message when it is not the trip on screen", async () => {
    addCheckpoint.mockRejectedValueOnce(new Error("offline"));
    await mount(onCurrent);
    await act(async () => {
      await api.startSave(DATA, undefined, undefined, OTHER);
    });
    await waitFor(() => expect(screen.getByTestId("state").textContent).toContain("offline (Other Trip)"));
  });
});

describe("Retry keeps the queued save (W11A)", () => {
  const WITH_EXPENSES: PendingSave["data"] = { ...DATA, happenedAt: 777, stagedTransactionIds: ["tx-1"] };

  it("re-sends a tagged save to its own trip with its time and linked expenses; an offered trip never moves it", async () => {
    addCheckpoint.mockRejectedValueOnce(new Error("offline"));
    const { rerender } = await mount(onOther);
    await act(async () => {
      await api.startSave(WITH_EXPENSES, undefined, undefined, OTHER);
    });
    await waitFor(() => expect(screen.getByTestId("state").textContent).toContain(":failed:trip-other:"));
    rerender(tree(sharedChanged));
    await act(async () => {
      await api.retrySave(api.saves[0].id, { tripId: "trip-new", title: "New Shared Trip" });
    });
    await waitFor(() => expect(addCheckpoint).toHaveBeenCalledTimes(2));
    expect(sentArgs()[1]).toMatchObject({ tripId: "trip-other", happenedAt: 777 });
    await waitFor(() => expect(updateTransaction).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "tx-1", tripId: "trip-other" })));
  });

  it("never re-sends a save it couldn't place on its own; only to the trip the Traveler chose, keeping its time and expenses", async () => {
    resolveTripAt.mockResolvedValue(null);
    seed({ id: "old", status: "saving", data: WITH_EXPENSES });
    await mount(onCurrent);
    await waitFor(() => expect(screen.getByTestId("state").textContent).toContain(":failed:none:Couldn't tell which trip"));
    expect(isUnplacedSave(api.saves[0])).toBe(true);

    // A plain retry asks again by the save's own time and still sends nothing.
    await act(async () => {
      await api.retrySave("old");
    });
    await waitFor(() => expect(resolveTripAt).toHaveBeenCalledTimes(2));
    expect(addCheckpoint).not.toHaveBeenCalled();
    expect(resolveTripAt).toHaveBeenLastCalledWith({ token: "t", at: 1234 });

    // The Traveler chooses the trip on screen.
    await waitFor(() => expect(isUnplacedSave(api.saves[0])).toBe(true));
    await act(async () => {
      await api.retrySave("old", { tripId: "trip-current", title: "Current Trip" });
    });
    await waitFor(() => expect(addCheckpoint).toHaveBeenCalledTimes(1));
    expect(sentArgs()[0]).toMatchObject({ tripId: "trip-current", happenedAt: 777 });
    await waitFor(() => expect(updateTransaction).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "tx-1", tripId: "trip-current" })));
    expect(resolveTripAt).toHaveBeenCalledTimes(2);
  });

  it("isUnplacedSave is false for a tagged, waiting or link-failed save", () => {
    const base = { id: "s", data: DATA, progress: 0, createdAt: 1, retryCount: 1 } as const;
    expect(isUnplacedSave({ ...base, status: "failed", tripId: "trip-a", error: "offline" })).toBe(false);
    expect(isUnplacedSave({ ...base, status: "failed", error: "Waiting to learn which trip this save belongs to." })).toBe(false);
    expect(isUnplacedSave({ ...base, status: "link-failed", checkpointId: "cp" })).toBe(false);
  });
});

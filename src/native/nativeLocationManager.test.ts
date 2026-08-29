import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  openSettings: vi.fn(),
  adaptiveStart: vi.fn(),
  adaptiveStop: vi.fn(),
  adaptiveAddListener: vi.fn(),
  adaptiveGetBootstrapPublishingState: vi.fn(),
  adaptiveBeginLegacyBootstrapPublishing: vi.fn(),
  adaptiveAcceptLegacyBootstrapFix: vi.fn(),
  adaptiveSetCalibrationActive: vi.fn(),
  adaptiveSyncMysteryMissions: vi.fn(),
  adaptiveGetMysteryProximityState: vi.fn(),
  adaptiveSetMysteryAudioMuted: vi.fn(),
  adaptiveTestMysterySpeech: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin: (name: string) => name === "AdaptiveLocation"
    ? {
        start: mocks.adaptiveStart,
        stop: mocks.adaptiveStop,
        addListener: mocks.adaptiveAddListener,
        getBootstrapPublishingState: mocks.adaptiveGetBootstrapPublishingState,
        beginLegacyBootstrapPublishing: mocks.adaptiveBeginLegacyBootstrapPublishing,
        acceptLegacyBootstrapFix: mocks.adaptiveAcceptLegacyBootstrapFix,
        setCalibrationActive: mocks.adaptiveSetCalibrationActive,
        syncMysteryMissions: mocks.adaptiveSyncMysteryMissions,
        getMysteryProximityState: mocks.adaptiveGetMysteryProximityState,
        setMysteryAudioMuted: mocks.adaptiveSetMysteryAudioMuted,
        testMysterySpeech: mocks.adaptiveTestMysterySpeech,
      }
    : {
        start: mocks.start,
        stop: mocks.stop,
        openSettings: mocks.openSettings,
      },
}));

import { nativeLocationManager } from "./nativeLocationManager";

describe("nativeLocationManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.start.mockResolvedValue(undefined);
    mocks.stop.mockResolvedValue(undefined);
    mocks.adaptiveStart.mockResolvedValue({ mode: "precise", liveRequested: true, changedAt: 1 });
    mocks.adaptiveStop.mockResolvedValue({ mode: "off", liveRequested: false, changedAt: 2 });
    mocks.adaptiveAddListener.mockResolvedValue({ remove: vi.fn() });
    mocks.adaptiveGetBootstrapPublishingState.mockResolvedValue({
      configurationReady: true,
      liveTrailEnabled: true,
    });
    mocks.adaptiveBeginLegacyBootstrapPublishing.mockResolvedValue({
      mode: "off",
      publishingPhase: "idle",
    });
    mocks.adaptiveAcceptLegacyBootstrapFix.mockResolvedValue(undefined);
    mocks.adaptiveSetCalibrationActive.mockResolvedValue({
      mode: "precise",
      liveRequested: true,
      changedAt: 1,
    });
    mocks.adaptiveSyncMysteryMissions.mockResolvedValue({ muted: false });
    // Reset private state for testing
    // @ts-expect-error accessing private for test
    nativeLocationManager.watchers = [];
    // @ts-expect-error accessing private for test
    nativeLocationManager.isStarted = false;
    // @ts-expect-error accessing private for test
    nativeLocationManager.currentOptions = null;
    // @ts-expect-error accessing private for test
    nativeLocationManager.adaptiveStarted = false;
    // @ts-expect-error accessing private for test
    nativeLocationManager.adaptiveListener = null;
    // @ts-expect-error accessing private for test
    nativeLocationManager.adaptiveStopRequested = false;
    // @ts-expect-error accessing private for test
    nativeLocationManager.publishingConfigurationPromise = null;
    // @ts-expect-error accessing private for test
    nativeLocationManager.syncPromise = Promise.resolve();
  });

  it("starts the plugin when the first watcher is added", async () => {
    nativeLocationManager.addWatcher({ distanceFilter: 10 }, vi.fn(), vi.fn());
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;

    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.start.mock.calls[0][0].distanceFilter).toBe(10);
  });

  it("stops the plugin when the last watcher is removed", async () => {
    const id = nativeLocationManager.addWatcher({ distanceFilter: 10 }, vi.fn(), vi.fn());
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;

    nativeLocationManager.removeWatcher(id);
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;

    expect(mocks.stop).toHaveBeenCalledTimes(1);
  });

  it("explicitly stops both native engines even when Legacy appears idle", async () => {
    await nativeLocationManager.explicitStop({ pendingSamples: "preserve" });

    expect(mocks.stop).toHaveBeenCalledTimes(1);
    expect(mocks.adaptiveStop).toHaveBeenCalledWith({ pendingSamples: "preserve" });
  });

  it("reads cached publishing readiness before verification completes", async () => {
    await expect(nativeLocationManager.getBootstrapPublishingState()).resolves.toEqual({
      configurationReady: true,
      liveTrailEnabled: true,
    });

    expect(mocks.adaptiveGetBootstrapPublishingState).toHaveBeenCalledTimes(1);
  });

  it("starts Legacy bootstrap publishing and forwards provisional fixes", async () => {
    await nativeLocationManager.beginLegacyBootstrapPublishing();
    await nativeLocationManager.acceptLegacyBootstrapFix({
      lat: 47.61,
      lon: -122.33,
      accuracy: 8,
      at: 1234,
    });

    expect(mocks.adaptiveAddListener).toHaveBeenCalledTimes(1);
    expect(mocks.adaptiveBeginLegacyBootstrapPublishing).toHaveBeenCalledTimes(1);
    expect(mocks.adaptiveAcceptLegacyBootstrapFix).toHaveBeenCalledWith({
      lat: 47.61,
      lon: -122.33,
      accuracy: 8,
      timestamp: 1234,
    });
  });

  it("serializes full Mystery Mission replacement syncs through the bridge", async () => {
    const payload = {
      enabled: true,
      revision: 42,
      missions: [{
        mysteryMissionDocumentId: "mm-1",
        stablePackId: "pack-1",
        linkedMissionId: "mission-1",
        lat: 47.61,
        lon: -122.33,
        resolveRadiusMeters: 75,
        narration: "Reveal",
        priority: 2,
        updatedAt: 40,
      }],
    };

    await nativeLocationManager.syncMysteryMissions(payload);

    expect(mocks.adaptiveSyncMysteryMissions).toHaveBeenCalledWith({ payload });
  });

  it("aggregates distanceFilter by taking the minimum", async () => {
    nativeLocationManager.addWatcher({ distanceFilter: 50 }, vi.fn(), vi.fn());
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;
    expect(mocks.start.mock.calls[0][0].distanceFilter).toBe(50);

    nativeLocationManager.addWatcher({ distanceFilter: 10 }, vi.fn(), vi.fn());
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;
    // Should stop then start with new aggregated options
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(mocks.start.mock.calls[1][0].distanceFilter).toBe(10);
  });

  it("aggregates background requirements", async () => {
    nativeLocationManager.addWatcher({ distanceFilter: 50 }, vi.fn(), vi.fn());
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;
    expect(mocks.start.mock.calls[0][0].backgroundMessage).toBeUndefined();

    nativeLocationManager.addWatcher(
      { distanceFilter: 50, backgroundMessage: "sharing" },
      vi.fn(),
      vi.fn(),
    );
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;
    expect(mocks.start.mock.calls[1][0].backgroundMessage).toBe("sharing");
  });

  it("broadcasts location updates to all watchers", async () => {
    const onFix1 = vi.fn();
    const onFix2 = vi.fn();
    nativeLocationManager.addWatcher({ distanceFilter: 50 }, onFix1, vi.fn());
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;

    nativeLocationManager.addWatcher({ distanceFilter: 10 }, onFix2, vi.fn());
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;

    const callback = mocks.start.mock.calls[1][1];
    callback({ latitude: 47.61, longitude: -122.33, accuracy: 8 });

    expect(onFix1).toHaveBeenCalledWith(expect.objectContaining({ lat: 47.61 }));
    expect(onFix2).toHaveBeenCalledWith(expect.objectContaining({ lat: 47.61 }));
  });

  it("broadcasts errors to all watchers", async () => {
    const onError1 = vi.fn();
    const onError2 = vi.fn();
    nativeLocationManager.addWatcher({ distanceFilter: 50 }, vi.fn(), onError1);
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;

    nativeLocationManager.addWatcher({ distanceFilter: 10 }, vi.fn(), onError2);
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;

    const callback = mocks.start.mock.calls[1][1];
    const error = new Error("fail");
    callback(undefined, error);

    expect(onError1).toHaveBeenCalledWith(error);
    expect(onError2).toHaveBeenCalledWith(error);
  });

  it("does not restart the plugin when aggregated options are unchanged", async () => {
    nativeLocationManager.addWatcher({ distanceFilter: 50 }, vi.fn(), vi.fn());
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;
    expect(mocks.start).toHaveBeenCalledTimes(1);

    // Second watcher with identical options leaves the aggregate unchanged, so
    // the plugin must not be torn down and restarted (avoids GPS thrash).
    nativeLocationManager.addWatcher({ distanceFilter: 50 }, vi.fn(), vi.fn());
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;

    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it("broadcasts errors to all watchers when the plugin fails to start", async () => {
    const error = new Error("start failed");
    mocks.start.mockRejectedValueOnce(error);
    const onError1 = vi.fn();
    const onError2 = vi.fn();

    nativeLocationManager.addWatcher({ distanceFilter: 50 }, vi.fn(), onError1);
    nativeLocationManager.addWatcher({ distanceFilter: 50 }, vi.fn(), onError2);
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;

    expect(onError1).toHaveBeenCalledWith(error);
    expect(onError2).toHaveBeenCalledWith(error);
  });

  it("requires permissions if any watcher requests them", async () => {
    nativeLocationManager.addWatcher({ distanceFilter: 50 }, vi.fn(), vi.fn());
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;
    expect(mocks.start.mock.calls[0][0].requestPermissions).toBe(false);

    nativeLocationManager.addWatcher(
      { distanceFilter: 50, requestPermissions: true },
      vi.fn(),
      vi.fn(),
    );
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;
    expect(mocks.start.mock.calls[1][0].requestPermissions).toBe(true);
  });

  it("drops negative speed values to undefined", async () => {
    const onFix = vi.fn();
    nativeLocationManager.addWatcher({ distanceFilter: 50 }, onFix, vi.fn());
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;

    const callback = mocks.start.mock.calls[0][1];
    callback({ latitude: 47.61, longitude: -122.33, accuracy: 8, speed: -1 });
    expect(onFix.mock.calls[0][0].speed).toBeUndefined();

    callback({ latitude: 47.61, longitude: -122.33, accuracy: 8, speed: 3.2 });
    expect(onFix.mock.calls[1][0].speed).toBe(3.2);
  });

  it("re-aggregates options when a non-last watcher is removed", async () => {
    nativeLocationManager.addWatcher({ distanceFilter: 50 }, vi.fn(), vi.fn());
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;

    const tighterId = nativeLocationManager.addWatcher(
      { distanceFilter: 10 },
      vi.fn(),
      vi.fn(),
    );
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;
    expect(mocks.start.mock.calls[1][0].distanceFilter).toBe(10);

    // Removing the tighter watcher should relax the aggregate back to 50, not stop.
    nativeLocationManager.removeWatcher(tighterId);
    // @ts-expect-error accessing private for test
    await nativeLocationManager.syncPromise;

    expect(mocks.start).toHaveBeenCalledTimes(3);
    expect(mocks.start.mock.calls[2][0].distanceFilter).toBe(50);
  });

  it("keeps a requested stop authoritative over a late adaptive start", async () => {
    let resolveStart!: (value: { mode: "precise"; liveRequested: true; changedAt: number }) => void;
    mocks.adaptiveStart.mockReturnValueOnce(new Promise((resolve) => {
      resolveStart = resolve;
    }));
    nativeLocationManager.addWatcher(
      { distanceFilter: 50, purpose: "live", adaptive: true },
      vi.fn(),
      vi.fn(),
    );
    await vi.waitFor(() => expect(mocks.adaptiveStart).toHaveBeenCalledTimes(1));

    const stopPromise = nativeLocationManager.explicitStop({ pendingSamples: "preserve" });
    resolveStart({ mode: "precise", liveRequested: true, changedAt: 1 });
    await stopPromise;

    expect(mocks.adaptiveStop).toHaveBeenCalled();
    // @ts-expect-error accessing private for test
    expect(nativeLocationManager.adaptiveStarted).toBe(false);
  });

  it("does not acknowledge an explicit stop before the native stop resolves", async () => {
    let resolveStop!: (value: { mode: "off"; liveRequested: false; changedAt: number }) => void;
    mocks.adaptiveStop.mockReturnValueOnce(new Promise((resolve) => {
      resolveStop = resolve;
    }));
    let acknowledged = false;

    const stopPromise = nativeLocationManager.explicitStop().then(() => {
      acknowledged = true;
    });
    await Promise.resolve();
    expect(acknowledged).toBe(false);

    resolveStop({ mode: "off", liveRequested: false, changedAt: 2 });
    await stopPromise;
    expect(acknowledged).toBe(true);
  });
});

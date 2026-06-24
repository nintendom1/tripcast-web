import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  openSettings: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin: () => ({
    start: mocks.start,
    stop: mocks.stop,
    openSettings: mocks.openSettings,
  }),
}));

import { nativeLocationManager } from "./nativeLocationManager";

describe("nativeLocationManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.start.mockResolvedValue(undefined);
    mocks.stop.mockResolvedValue(undefined);
    // Reset private state for testing
    // @ts-expect-error accessing private for test
    nativeLocationManager.watchers = [];
    // @ts-expect-error accessing private for test
    nativeLocationManager.isStarted = false;
    // @ts-expect-error accessing private for test
    nativeLocationManager.currentOptions = null;
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
});

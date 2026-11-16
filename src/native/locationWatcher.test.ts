import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addWatcher: vi.fn(),
  removeWatcher: vi.fn(),
  openSettings: vi.fn(),
  isNativePlatform: vi.fn(),
  getPlatform: vi.fn(() => "ios"),
  getLocalTrailSnapshot: vi.fn(),
  clearRouteRecord: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform, getPlatform: mocks.getPlatform },
}));

vi.mock("./nativeLocationManager", () => ({
  nativeLocationManager: {
    addWatcher: mocks.addWatcher,
    removeWatcher: mocks.removeWatcher,
    openSettings: mocks.openSettings,
    getLocalTrailSnapshot: mocks.getLocalTrailSnapshot,
    clearRouteRecord: mocks.clearRouteRecord,
  },
}));

import {
  clearNativeRouteRecord,
  getNativeLocalTrailSnapshot,
  isNativeLocationAvailable,
  openNativeLocationSettings,
  startNativeLocationWatch,
} from "./locationWatcher";

describe("locationWatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addWatcher.mockReturnValue("w-1");
  });

  it("reports native availability from Capacitor", () => {
    mocks.isNativePlatform.mockReturnValue(true);
    expect(isNativeLocationAvailable()).toBe(true);
    mocks.isNativePlatform.mockReturnValue(false);
    expect(isNativeLocationAvailable()).toBe(false);
  });

  it("starts a background-capable watcher with a battery-conscious distance filter", () => {
    startNativeLocationWatch(vi.fn(), vi.fn());
    expect(mocks.addWatcher).toHaveBeenCalledTimes(1);
    const [options] = mocks.addWatcher.mock.calls[0];
    expect(options.backgroundMessage).toEqual(expect.any(String));
    expect(options.requestPermissions).toBe(true);
    expect(options.distanceFilter).toBe(50);
  });

  it("removes the watcher on cleanup", () => {
    const stop = startNativeLocationWatch(vi.fn(), vi.fn());
    stop();
    expect(mocks.removeWatcher).toHaveBeenCalledWith("w-1");
  });

  it("opens the native settings page", () => {
    openNativeLocationSettings();
    expect(mocks.openSettings).toHaveBeenCalledTimes(1);
  });

  it("asks the iPhone for its route record and clears it; a browser has none", async () => {
    const route = { tripId: "trip-a", sinceSeq: 4, generation: "g1" };
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getLocalTrailSnapshot.mockResolvedValue({ queueRevision: 1, points: [] });
    mocks.clearRouteRecord.mockResolvedValue({ removed: 2 });

    await expect(getNativeLocalTrailSnapshot({ route })).resolves.toEqual({ queueRevision: 1, points: [] });
    expect(mocks.getLocalTrailSnapshot).toHaveBeenCalledWith({ route });
    await expect(clearNativeRouteRecord({ tripId: "trip-a", sampledAt: [5] })).resolves.toEqual({ removed: 2 });
    expect(mocks.clearRouteRecord).toHaveBeenCalledWith({ tripId: "trip-a", sampledAt: [5] });

    vi.clearAllMocks();
    mocks.isNativePlatform.mockReturnValue(false);
    await expect(getNativeLocalTrailSnapshot({ route })).resolves.toEqual({ queueRevision: 0, points: [] });
    await expect(clearNativeRouteRecord({})).resolves.toEqual({ removed: 0 });
    expect(mocks.getLocalTrailSnapshot).not.toHaveBeenCalled();
    expect(mocks.clearRouteRecord).not.toHaveBeenCalled();
  });
});

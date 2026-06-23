import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addWatcher: vi.fn(),
  removeWatcher: vi.fn(),
  isNativePlatform: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}));

vi.mock("./nativeLocationManager", () => ({
  nativeLocationManager: {
    addWatcher: mocks.addWatcher,
    removeWatcher: mocks.removeWatcher,
  },
}));

import { startCalibrationLocationWatch } from "./calibrationWatcher";

describe("calibrationWatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addWatcher.mockReturnValue("w-1");
  });

  it("starts a foreground-only watcher with zero distance filter on native", () => {
    mocks.isNativePlatform.mockReturnValue(true);
    startCalibrationLocationWatch(vi.fn(), vi.fn());
    expect(mocks.addWatcher).toHaveBeenCalledTimes(1);
    const [options] = mocks.addWatcher.mock.calls[0];
    expect(options.backgroundMessage).toBeUndefined();
    expect(options.requestPermissions).toBe(true);
    expect(options.distanceFilter).toBe(0);
  });

  it("removes the watcher on cleanup on native", () => {
    mocks.isNativePlatform.mockReturnValue(true);
    const stop = startCalibrationLocationWatch(vi.fn(), vi.fn());
    stop();
    expect(mocks.removeWatcher).toHaveBeenCalledWith("w-1");
  });

  it("falls back to navigator.geolocation when not native", () => {
    mocks.isNativePlatform.mockReturnValue(false);
    const mockWatchPosition = vi.fn();
    const mockClearWatch = vi.fn();
    vi.stubGlobal("navigator", {
      geolocation: {
        watchPosition: mockWatchPosition,
        clearWatch: mockClearWatch,
      },
    });

    const stop = startCalibrationLocationWatch(vi.fn(), vi.fn());
    expect(mockWatchPosition).toHaveBeenCalled();

    stop();
    expect(mockClearWatch).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

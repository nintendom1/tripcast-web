import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addWatcher: vi.fn(),
  removeWatcher: vi.fn(),
  openSettings: vi.fn(),
  isNativePlatform: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}));

vi.mock("./nativeLocationManager", () => ({
  nativeLocationManager: {
    addWatcher: mocks.addWatcher,
    removeWatcher: mocks.removeWatcher,
    openSettings: mocks.openSettings,
  },
}));

import {
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
});

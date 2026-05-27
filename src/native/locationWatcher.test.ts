import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addWatcher: vi.fn(),
  removeWatcher: vi.fn(),
  openSettings: vi.fn(),
  isNativePlatform: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
  registerPlugin: () => ({
    addWatcher: mocks.addWatcher,
    removeWatcher: mocks.removeWatcher,
    openSettings: mocks.openSettings,
  }),
}));

import {
  isNativeLocationAvailable,
  openNativeLocationSettings,
  startNativeLocationWatch,
} from "./locationWatcher";

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("locationWatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addWatcher.mockResolvedValue("watcher-1");
    mocks.removeWatcher.mockResolvedValue(undefined);
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
    // backgroundMessage is what enables locked/background delivery.
    expect(options.backgroundMessage).toEqual(expect.any(String));
    expect(options.requestPermissions).toBe(true);
    expect(options.distanceFilter).toBe(50);
  });

  it("maps plugin locations to {lat, lon, accuracy} fixes", () => {
    const onFix = vi.fn();
    startNativeLocationWatch(onFix, vi.fn());
    const callback = mocks.addWatcher.mock.calls[0][1];

    callback({ latitude: 47.61, longitude: -122.33, accuracy: 8 });

    expect(onFix).toHaveBeenCalledWith({ lat: 47.61, lon: -122.33, accuracy: 8 });
  });

  it("forwards callback errors and ignores empty fixes", () => {
    const onFix = vi.fn();
    const onError = vi.fn();
    startNativeLocationWatch(onFix, onError);
    const callback = mocks.addWatcher.mock.calls[0][1];

    const error = Object.assign(new Error("denied"), { code: "NOT_AUTHORIZED" });
    callback(undefined, error);

    expect(onError).toHaveBeenCalledWith(error);
    expect(onFix).not.toHaveBeenCalled();
  });

  it("removes the watcher on cleanup", async () => {
    const stop = startNativeLocationWatch(vi.fn(), vi.fn());
    await flushMicrotasks(); // let addWatcher resolve and capture the id

    stop();

    expect(mocks.removeWatcher).toHaveBeenCalledWith({ id: "watcher-1" });
  });

  it("opens the native settings page", () => {
    openNativeLocationSettings();
    expect(mocks.openSettings).toHaveBeenCalledTimes(1);
  });
});

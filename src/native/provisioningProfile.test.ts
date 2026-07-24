import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  getPlatform: vi.fn(),
  getExpiration: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
    getPlatform: mocks.getPlatform,
  },
  registerPlugin: () => ({
    getExpiration: mocks.getExpiration,
  }),
}));

import {
  getProvisioningProfileExpiration,
  isNativeIos,
} from "./provisioningProfile";

describe("provisioningProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isNativePlatform.mockReturnValue(false);
    mocks.getPlatform.mockReturnValue("web");
  });

  it("only reports native iOS as eligible", () => {
    expect(isNativeIos()).toBe(false);

    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getPlatform.mockReturnValue("android");
    expect(isNativeIos()).toBe(false);

    mocks.getPlatform.mockReturnValue("ios");
    expect(isNativeIos()).toBe(true);
  });

  it("returns the actual profile expiration on native iOS", async () => {
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getPlatform.mockReturnValue("ios");
    mocks.getExpiration.mockResolvedValue({ expiresAtMs: 1_800_000_000_000 });

    await expect(getProvisioningProfileExpiration()).resolves.toBe(
      1_800_000_000_000,
    );
  });

  it("does not call the plugin outside native iOS", async () => {
    await expect(getProvisioningProfileExpiration()).resolves.toBeNull();
    expect(mocks.getExpiration).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { expiresAtMs: null },
    { expiresAtMs: Number.NaN },
    { expiresAtMs: -1 },
  ])("returns null for an unavailable profile response %#", async (response) => {
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getPlatform.mockReturnValue("ios");
    mocks.getExpiration.mockResolvedValue(response);

    await expect(getProvisioningProfileExpiration()).resolves.toBeNull();
  });

  it("returns null when the native bridge rejects", async () => {
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getPlatform.mockReturnValue("ios");
    mocks.getExpiration.mockRejectedValue(new Error("unavailable"));

    await expect(getProvisioningProfileExpiration()).resolves.toBeNull();
  });
});

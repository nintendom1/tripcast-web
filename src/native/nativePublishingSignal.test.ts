import { describe, expect, it, vi } from "vitest";

import {
  getNativePublishingRetryNonce,
  isNativePublishingReady,
  requestNativePublishingRetry,
  setNativePublishingReady,
  subscribeNativePublishingRetry,
} from "./nativePublishingSignal";

describe("nativePublishingSignal", () => {
  it("bumps the retry nonce and notifies subscribers until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNativePublishingRetry(listener);
    const before = getNativePublishingRetryNonce();

    requestNativePublishingRetry();
    expect(getNativePublishingRetryNonce()).toBe(before + 1);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    requestNativePublishingRetry();
    expect(getNativePublishingRetryNonce()).toBe(before + 2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stores the readiness flag", () => {
    expect(isNativePublishingReady()).toBe(false);
    setNativePublishingReady(true);
    expect(isNativePublishingReady()).toBe(true);
    setNativePublishingReady(false);
    expect(isNativePublishingReady()).toBe(false);
  });
});

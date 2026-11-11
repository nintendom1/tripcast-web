import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConvexReactClient } from "convex/react";
import { tripcastApi } from "../../convex/tripcastApi";
import { getUsageBaselines } from "../../lib/usageBaselines";
import { prepareReplayImages } from "./replayImagePreparation";

const PREVIEW_BYTES = 60_000;

// jsdom has no canvas or ImageBitmap: stub just enough for encodeReplayImage to produce a preview.
function installEncoderStubs() {
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 1600, height: 1200, close: vi.fn() }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ fillRect: vi.fn(), drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
    cb(new Blob([new Uint8Array(PREVIEW_BYTES)], { type: "image/jpeg" }));
  });
}

function fakeClient(accepted: boolean) {
  return {
    mutation: vi.fn(async (reference: unknown) => {
      if (reference === tripcastApi.replayImages.acquire) return true;
      if (reference === tripcastApi.replayImages.claim) return { originalUrl: "https://files.example/original" };
      return null;
    }),
    action: vi.fn().mockResolvedValue(accepted),
  } as unknown as ConvexReactClient;
}

async function prepareOne(accepted: boolean) {
  await prepareReplayImages(fakeClient(accepted), "token", ["image-1"], {
    source: "image-1",
    blob: new Blob([new Uint8Array(500_000)], { type: "image/jpeg" }),
  });
}

describe("prepareReplayImages", () => {
  beforeEach(() => {
    installEncoderStubs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("records the preview bytes for the Convex Usage estimate once Convex accepts the preview", async () => {
    const before = getUsageBaselines().fileBytesAddedThisMonth;

    await prepareOne(true);

    expect(getUsageBaselines().fileBytesAddedThisMonth - before).toBe(PREVIEW_BYTES);
  });

  it("records nothing when Convex does not accept the preview", async () => {
    const before = getUsageBaselines().fileBytesAddedThisMonth;

    await prepareOne(false);

    expect(getUsageBaselines().fileBytesAddedThisMonth).toBe(before);
  });
});

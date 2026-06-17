import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  compressImage,
  uploadStoryImage,
  validateStoryImageFile,
} from "./storyImageUpload";

// jsdom has no canvas implementation — these tests stub Canvas + Image so the
// compression pipeline can run synchronously and we can assert on flow control
// (validation order, blob choice, object-URL revocation) rather than pixel
// output, which is meaningless without a real renderer anyway.

type ImageHandlers = { onload?: () => void; onerror?: () => void };

function installImageStub(opts: { width: number; height: number; succeed: boolean }) {
  class FakeImage implements ImageHandlers {
    onload?: () => void;
    onerror?: () => void;
    width = opts.width;
    height = opts.height;
    set src(_value: string) {
      queueMicrotask(() => {
        if (opts.succeed) this.onload?.();
        else this.onerror?.();
      });
    }
  }
  vi.stubGlobal("Image", FakeImage as unknown as typeof Image);
}

function installCanvasStub(toBlobResult: Blob | null) {
  // jsdom returns a partial canvas; just override the two methods we touch.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    cb: BlobCallback,
  ) {
    cb(toBlobResult);
  });
}

function makeImageFile(sizeBytes: number, type = "image/jpeg"): File {
  // The bytes never get decoded thanks to the Image stub — we just need
  // something with the right .size and .type to feed validation.
  return new File([new Uint8Array(sizeBytes)], "photo.jpg", { type });
}

describe("validateStoryImageFile", () => {
  it("accepts an image under the sanity cap", () => {
    expect(() => validateStoryImageFile(makeImageFile(2 * 1024 * 1024))).not.toThrow();
  });

  it("accepts a 10 MB image (compression handles oversize, not validation)", () => {
    expect(() => validateStoryImageFile(makeImageFile(10 * 1024 * 1024))).not.toThrow();
  });

  it("rejects non-image MIME types", () => {
    const txt = new File(["hello"], "note.txt", { type: "text/plain" });
    expect(() => validateStoryImageFile(txt)).toThrow(/image file/i);
  });

  it("rejects files above the input sanity cap", () => {
    expect(() => validateStoryImageFile(makeImageFile(60 * 1024 * 1024))).toThrow(/too large/i);
  });
});

describe("compressImage", () => {
  let revokeSpy: ReturnType<typeof vi.spyOn>;
  let createUrlSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("revokes the object URL on success", async () => {
    installImageStub({ width: 2000, height: 1000, succeed: true });
    installCanvasStub(new Blob([new Uint8Array(1000)], { type: "image/jpeg" }));
    await compressImage(makeImageFile(2 * 1024 * 1024));
    expect(createUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith("blob:fake");
  });

  it("revokes the object URL when image decode fails", async () => {
    installImageStub({ width: 0, height: 0, succeed: false });
    installCanvasStub(null);
    await expect(compressImage(makeImageFile(1024))).rejects.toThrow(/load image/i);
    expect(revokeSpy).toHaveBeenCalledWith("blob:fake");
  });

  it("revokes the object URL when toBlob returns null", async () => {
    installImageStub({ width: 1000, height: 1000, succeed: true });
    installCanvasStub(null);
    await expect(compressImage(makeImageFile(1024))).rejects.toThrow(/compress image/i);
    expect(revokeSpy).toHaveBeenCalledWith("blob:fake");
  });
});

describe("uploadStoryImage", () => {
  const getUploadUrl = () => Promise.resolve("https://upload.example/123");

  beforeEach(() => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("compresses a large phone photo and uploads the smaller blob", async () => {
    installImageStub({ width: 4000, height: 3000, succeed: true });
    // Original: 10 MB. Compressed: 800 KB.
    installCanvasStub(new Blob([new Uint8Array(800_000)], { type: "image/jpeg" }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ storageId: "store-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadStoryImage(makeImageFile(10 * 1024 * 1024), getUploadUrl);
    expect(result.storageId).toBe("store-1");

    const body = fetchMock.mock.calls[0][1].body as Blob;
    expect(body.size).toBe(800_000);
  });

  it("falls back to the original when compression produces a larger blob", async () => {
    installImageStub({ width: 800, height: 600, succeed: true });
    // Original tiny JPEG (200 KB) re-encoded grows to 300 KB → keep original.
    installCanvasStub(new Blob([new Uint8Array(300_000)], { type: "image/jpeg" }));
    const file = makeImageFile(200_000);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ storageId: "store-2" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await uploadStoryImage(file, getUploadUrl);
    const body = fetchMock.mock.calls[0][1].body as Blob;
    expect(body).toBe(file);
  });

  it("uploads the original when compression throws but the file is under cap", async () => {
    installImageStub({ width: 0, height: 0, succeed: false });
    installCanvasStub(null);
    const file = makeImageFile(2 * 1024 * 1024);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ storageId: "store-3" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await uploadStoryImage(file, getUploadUrl);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects when compression fails AND the original exceeds the post-compression cap", async () => {
    installImageStub({ width: 0, height: 0, succeed: false });
    installCanvasStub(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadStoryImage(makeImageFile(10 * 1024 * 1024), getUploadUrl),
    ).rejects.toThrow(/too large/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates a non-OK upload response", async () => {
    installImageStub({ width: 1000, height: 1000, succeed: true });
    installCanvasStub(new Blob([new Uint8Array(500)], { type: "image/jpeg" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(
      uploadStoryImage(makeImageFile(1024), getUploadUrl),
    ).rejects.toThrow(/unable to upload/i);
  });
});

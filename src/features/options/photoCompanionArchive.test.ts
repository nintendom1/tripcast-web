import { describe, it, expect } from "vitest";
import { ZipWriter, BlobWriter, BlobReader } from "@zip.js/zip.js";
import {
  validatePath,
  validateMime,
  validateArchiveZip,
  computeSha256,
  type PhotoCompanionArchiveManifest
} from "./photoCompanionArchive";

async function createMockZip(manifest: unknown, files: { [path: string]: string | Blob }): Promise<Blob> {
  const zipWriter = new ZipWriter(new BlobWriter("application/zip"));

  // Add manifest
  const manifestStr = typeof manifest === "string" ? manifest : JSON.stringify(manifest);
  await zipWriter.add("manifest.json", new BlobReader(new Blob([manifestStr], { type: "application/json" })));

  // Add files
  for (const [path, content] of Object.entries(files)) {
    const blob = typeof content === "string" ? new Blob([content], { type: "image/jpeg" }) : content;
    await zipWriter.add(path, new BlobReader(blob));
  }

  return await zipWriter.close();
}

describe("photoCompanionArchive Core Validator", () => {
  describe("validatePath", () => {
    it("accepts valid canonical paths", () => {
      expect(validatePath("photos/pin1.jpg")).toBeNull();
      expect(validatePath("photos/pin_abc-123.jpeg")).toBeNull();
      expect(validatePath("photos/a.png")).toBeNull();
      expect(validatePath("photos/b.webp")).toBeNull();
      expect(validatePath("photos/c.gif")).toBeNull();
    });

    it("rejects non-canonical structures", () => {
      expect(validatePath("../photo.jpg")).not.toBeNull();
      expect(validatePath("photos/../photo.jpg")).not.toBeNull();
      expect(validatePath("./photos/photo.jpg")).not.toBeNull();
      expect(validatePath("/photos/photo.jpg")).not.toBeNull();
      expect(validatePath("\\photos\\photo.jpg")).not.toBeNull();
      expect(validatePath("photos\\..\\photo.jpg")).not.toBeNull();
      expect(validatePath("C:\\photo.jpg")).not.toBeNull();
      expect(validatePath("//server/photo.jpg")).not.toBeNull();
      expect(validatePath("photos//photo.jpg")).not.toBeNull();
      expect(validatePath("photos/%2e%2e/photo.jpg")).not.toBeNull();
      expect(validatePath("photos/subdirectory/photo.jpg")).not.toBeNull();
    });

    it("rejects non-standard control or non-ASCII characters", () => {
      expect(validatePath("photos/ph\x00oto.jpg")).not.toBeNull();
      expect(validatePath("photos/phøto.jpg")).not.toBeNull();
    });
  });

  describe("validateMime", () => {
    it("accepts correct MIME and extension combinations", () => {
      expect(validateMime("image/jpeg", "photos/1.jpg")).toBeNull();
      expect(validateMime("image/jpeg", "photos/1.jpeg")).toBeNull();
      expect(validateMime("image/png", "photos/1.png")).toBeNull();
      expect(validateMime("image/webp", "photos/1.webp")).toBeNull();
    });

    it("rejects parameters in MIME types", () => {
      expect(validateMime("image/jpeg; charset=utf-8", "photos/1.jpg")).not.toBeNull();
    });

    it("rejects mismatching extension and MIME", () => {
      expect(validateMime("image/jpeg", "photos/1.png")).not.toBeNull();
      expect(validateMime("image/png", "photos/1.jpg")).not.toBeNull();
    });

    it("rejects unsupported MIME types", () => {
      expect(validateMime("image/svg+xml", "photos/1.svg")).not.toBeNull();
      expect(validateMime("application/octet-stream", "photos/1.jpg")).not.toBeNull();
    });
  });

  describe("validateArchiveZip", () => {
    it("successfully validates a conformant photo companion zip", async () => {
      const imgData = new Uint8Array([1, 2, 3, 4]);
      const imgBlob = new Blob([imgData], { type: "image/jpeg" });
      const sha256 = await computeSha256(await imgBlob.arrayBuffer());

      const manifest: PhotoCompanionArchiveManifest = {
        format: "tripcast-photo-companion",
        version: 1,
        exportedAt: "2026-07-15T12:00:00.000Z",
        selection: { startMs: null, endMs: null },
        photos: [
          {
            pinRef: "checkin:pin-1",
            path: "photos/pin-1.jpg",
            contentType: "image/jpeg",
            bytes: imgBlob.size,
            sha256: sha256,
            imageWidth: 100,
            imageHeight: 100,
            imageSize: "medium"
          }
        ],
        missing: []
      };

      const zipBlob = await createMockZip(manifest, { "photos/pin-1.jpg": imgBlob });
      const result = await validateArchiveZip(zipBlob);

      expect(result.manifest.format).toBe("tripcast-photo-companion");
      expect(result.photoBlobs.has("checkin:pin-1")).toBe(true);
      expect(result.photoBlobs.get("checkin:pin-1")?.entry.path).toBe("photos/pin-1.jpg");
    });

    it("rejects when manifest.json is missing", async () => {
      const zipWriter = new ZipWriter(new BlobWriter("application/zip"));
      await zipWriter.add("photos/some-file.jpg", new BlobReader(new Blob(["data"])));
      const emptyZip = await zipWriter.close();

      await expect(validateArchiveZip(emptyZip)).rejects.toThrow("Missing manifest.json at ZIP root.");
    });

    it("rejects when format or version is incorrect", async () => {
      const manifest = {
        format: "tripcast-photo-companion",
        version: 2, // unsupported
        photos: []
      };
      const zipBlob = await createMockZip(manifest, {});
      await expect(validateArchiveZip(zipBlob)).rejects.toThrow("Unsupported manifest format or version");
    });

    it("rejects when size or checksum mismatches", async () => {
      const imgBlob = new Blob(["correct-data"], { type: "image/jpeg" });
      const manifest = {
        format: "tripcast-photo-companion",
        version: 1,
        photos: [
          {
            pinRef: "checkin:pin-1",
            path: "photos/pin-1.jpg",
            contentType: "image/jpeg",
            bytes: imgBlob.size,
            sha256: "incorrect-sha-hash"
          }
        ]
      };

      const zipBlob = await createMockZip(manifest, { "photos/pin-1.jpg": imgBlob });
      await expect(validateArchiveZip(zipBlob)).rejects.toThrow("SHA-256 checksum mismatch");
    });

    it("rejects when extra unexpected files exist in ZIP", async () => {
      const imgBlob = new Blob(["data"], { type: "image/jpeg" });
      const sha256 = await computeSha256(await imgBlob.arrayBuffer());
      const manifest = {
        format: "tripcast-photo-companion",
        version: 1,
        photos: [
          {
            pinRef: "checkin:pin-1",
            path: "photos/pin-1.jpg",
            contentType: "image/jpeg",
            bytes: imgBlob.size,
            sha256: sha256
          }
        ]
      };

      const zipBlob = await createMockZip(manifest, {
        "photos/pin-1.jpg": imgBlob,
        "photos/unexpected.jpg": new Blob(["data2"])
      });
      await expect(validateArchiveZip(zipBlob)).rejects.toThrow("Unexpected file in ZIP not listed in manifest");
    });
  });
});

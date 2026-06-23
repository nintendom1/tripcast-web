import ExifReader from "exifreader";
import { debugLoggerFor } from "../../debug/useDebugLogger";

const MAX_STORY_IMAGE_BYTES = 8 * 1024 * 1024;
// Reject obviously-broken/huge uploads BEFORE attempting to decode into a
// canvas — a 100 MP photo can OOM the renderer on a low-end phone.
const MAX_INPUT_BYTES = 50 * 1024 * 1024;
// Tuned down from 1600/0.8 to cut served image bytes (~30-40% smaller) and the
// resulting Convex serving egress; 1280px @ q0.72 is still crisp on phone
// screens. Applies to newly-uploaded images only.
const TARGET_IMAGE_MAX_DIMENSION = 1280;
const COMPRESSION_QUALITY = 0.72;

const log = debugLoggerFor("storyImageUpload", "src/features/journal/storyImageUpload.ts");

export function validateStoryImageFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("That image is too large to upload.");
  }
}

export async function compressImage(
  file: File,
): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    const cleanup = () => URL.revokeObjectURL(objectUrl);

    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > TARGET_IMAGE_MAX_DIMENSION) {
            height = Math.round((height * TARGET_IMAGE_MAX_DIMENSION) / width);
            width = TARGET_IMAGE_MAX_DIMENSION;
          }
        } else {
          if (height > TARGET_IMAGE_MAX_DIMENSION) {
            width = Math.round((width * TARGET_IMAGE_MAX_DIMENSION) / height);
            height = TARGET_IMAGE_MAX_DIMENSION;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          reject(new Error("Failed to get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            cleanup();
            if (blob) resolve({ blob, width, height });
            else reject(new Error("Failed to compress image"));
          },
          "image/jpeg",
          COMPRESSION_QUALITY,
        );
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    img.onerror = () => {
      cleanup();
      reject(new Error("Failed to load image for compression"));
    };
    img.src = objectUrl;
  });
}

export type ImageMetadata = {
  date?: number;
  lat?: number;
  lon?: number;
};

export async function extractImageMetadata(file: File): Promise<ImageMetadata | null> {
  try {
    const tags = await ExifReader.load(file, {
      expanded: true,
      length: "auto",
      includeOffsets: true,
    });

    const nextMetadata: ImageMetadata = {};

    const dateStr = tags.exif?.DateTimeOriginal?.description;
    if (dateStr) {
      const [datePart, timePart] = dateStr.split(" ");
      const normalizedDateStr = datePart.replace(/:/g, "-") + "T" + timePart;
      const offset = tags.exif?.OffsetTimeOriginal?.description;
      const date = new Date(offset ? normalizedDateStr + offset : normalizedDateStr);
      if (!isNaN(date.getTime())) {
        nextMetadata.date = date.getTime();
      }
    }

    const lat = tags.gps?.Latitude;
    const lon = tags.gps?.Longitude;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      nextMetadata.lat = lat;
      nextMetadata.lon = lon;
    }

    return Object.keys(nextMetadata).length > 0 ? nextMetadata : null;
  } catch (error) {
    log.warn("story-image:metadata-error", "interaction", {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function uploadStoryImage(
  file: File,
  getUploadUrl: () => Promise<string>,
): Promise<{ storageId: string; width?: number; height?: number }> {
  validateStoryImageFile(file);

  let uploadBlob: Blob = file;
  let finalWidth: number | undefined;
  let finalHeight: number | undefined;

  const startedAt = performance.now();
  try {
    const { blob: compressed, width, height } = await compressImage(file);
    finalWidth = width;
    finalHeight = height;

    // Already-small JPEGs can grow after a re-encode — keep whichever is smaller.
    if (compressed.size < file.size) {
      uploadBlob = compressed;
      log.logPerformance("story-image:compress", {
        originalBytes: file.size,
        compressedBytes: compressed.size,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    } else {
      log.logPerformance("story-image:compress:skipped-grew", {
        originalBytes: file.size,
        compressedBytes: compressed.size,
      });
    }
  } catch (e) {
    log.warn("story-image:compress:error", "performance", {
      message: e instanceof Error ? e.message : String(e),
      originalBytes: file.size,
    });
  }

  if (uploadBlob.size > MAX_STORY_IMAGE_BYTES) {
    throw new Error("Image is too large even after compression.");
  }

  const uploadUrl = await getUploadUrl();
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": uploadBlob.type || "application/octet-stream" },
    body: uploadBlob,
  });
  if (!response.ok) {
    throw new Error("Unable to upload image.");
  }
  const result = (await response.json()) as { storageId?: string };
  if (!result.storageId) {
    throw new Error("Image upload did not return a storage id.");
  }
  return {
    storageId: result.storageId,
    width: finalWidth,
    height: finalHeight,
  };
}

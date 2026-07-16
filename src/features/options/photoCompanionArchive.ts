import { BlobReader, BlobWriter, TextWriter, ZipReader } from "@zip.js/zip.js";

export const PHOTO_MIME_EXTENSIONS = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "image/avif": [".avif"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
} as const;

export type PhotoCompanionContentType = keyof typeof PHOTO_MIME_EXTENSIONS;

export interface PhotoCompanionArchivePhoto {
  pinRef: string;
  path: string;
  contentType: PhotoCompanionContentType;
  bytes: number;
  sha256: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageSize?: "compact" | "medium" | "large" | null;
}

export type PhotoCompanionMissingReason =
  | "storage_missing"
  | "url_unavailable"
  | "unsupported_content_type"
  | "download_failed"
  | "metadata_mismatch";

export interface PhotoCompanionArchiveMissing {
  pinRef: string;
  reason: PhotoCompanionMissingReason;
  contentType: string | null;
}

export interface PhotoCompanionArchiveManifest {
  format: "tripcast-photo-companion";
  version: 1;
  exportedAt: string;
  selection: {
    startMs: number | null;
    endMs: number | null;
  };
  photos: PhotoCompanionArchivePhoto[];
  missing: PhotoCompanionArchiveMissing[];
}

export interface InspectedCompanionZip {
  manifest: PhotoCompanionArchiveManifest;
  totalPhotoBytes: number;
}

export interface ValidatedCompanionZip extends InspectedCompanionZip {
  photoBlobs: Map<string, { blob: Blob; entry: PhotoCompanionArchivePhoto }>;
  photoErrors: Map<string, string>;
}

const MAX_MANIFEST_BYTES = 5 * 1024 * 1024;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_MANIFEST_PHOTOS = 8_000;
const SHA256_BASE64_PATTERN = /^[A-Za-z0-9+/]{43}=$/;
const PIN_REF_PATTERN = /^checkin:[A-Za-z0-9_-]{1,160}$/;
const PHOTO_PATH_PATTERN = /^photos\/[A-Za-z0-9_-]{1,160}\.(jpg|jpeg|png|webp|gif|avif|heic|heif)$/;
const MISSING_REASONS = new Set<PhotoCompanionMissingReason>([
  "storage_missing",
  "url_unavailable",
  "unsupported_content_type",
  "download_failed",
  "metadata_mismatch",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNullableFiniteNumber(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`manifest.json field "${field}" must be a finite number or null.`);
  }
  return value;
}

function parseOptionalDimension(value: unknown, field: string): number | null | undefined {
  if (value === undefined || value === null) return value;
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`manifest.json field "${field}" must be a positive integer, null, or omitted.`);
  }
  return value as number;
}

function parsePinRef(value: unknown, field: string): string {
  if (typeof value !== "string" || !PIN_REF_PATTERN.test(value)) {
    throw new Error(`manifest.json field "${field}" must be a canonical checkin reference.`);
  }
  return value;
}

function parseManifest(value: unknown): PhotoCompanionArchiveManifest {
  if (!isRecord(value)) throw new Error("manifest.json root must be an object.");
  if (value.format !== "tripcast-photo-companion" || value.version !== 1) {
    throw new Error(
      "Unsupported manifest format or version. Expected format 'tripcast-photo-companion' and version 1.",
    );
  }
  if (typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt))) {
    throw new Error('manifest.json field "exportedAt" must be a valid date string.');
  }
  if (!isRecord(value.selection)) {
    throw new Error('manifest.json field "selection" must be an object.');
  }
  const startMs = parseNullableFiniteNumber(value.selection.startMs, "selection.startMs");
  const endMs = parseNullableFiniteNumber(value.selection.endMs, "selection.endMs");
  if (startMs !== null && endMs !== null && startMs > endMs) {
    throw new Error("manifest.json selection startMs cannot be after endMs.");
  }
  if (!Array.isArray(value.photos)) throw new Error('manifest.json field "photos" must be an array.');
  if (!Array.isArray(value.missing)) throw new Error('manifest.json field "missing" must be an array.');
  if (value.photos.length > MAX_MANIFEST_PHOTOS) {
    throw new Error(`Archive contains more than ${MAX_MANIFEST_PHOTOS.toLocaleString()} photos.`);
  }

  const photos = value.photos.map((rawPhoto, index): PhotoCompanionArchivePhoto => {
    if (!isRecord(rawPhoto)) throw new Error(`manifest.json photos[${index}] must be an object.`);
    const pinRef = parsePinRef(rawPhoto.pinRef, `photos[${index}].pinRef`);
    if (typeof rawPhoto.path !== "string") {
      throw new Error(`Manifest photo entry for ${pinRef} is missing path.`);
    }
    const pathError = validatePath(rawPhoto.path);
    if (pathError) throw new Error(`Invalid photo path in manifest "${rawPhoto.path}": ${pathError}`);
    if (typeof rawPhoto.contentType !== "string") {
      throw new Error(`Manifest photo "${rawPhoto.path}" is missing contentType.`);
    }
    const mimeError = validateMime(rawPhoto.contentType, rawPhoto.path);
    if (mimeError) {
      throw new Error(`Invalid MIME/extension agreement in manifest for "${rawPhoto.path}": ${mimeError}`);
    }
    if (
      !Number.isInteger(rawPhoto.bytes) ||
      (rawPhoto.bytes as number) < 0 ||
      (rawPhoto.bytes as number) > MAX_PHOTO_BYTES
    ) {
      throw new Error(`Photo "${rawPhoto.path}" must declare an integer size from 0 through 8 MiB.`);
    }
    if (typeof rawPhoto.sha256 !== "string" || !SHA256_BASE64_PATTERN.test(rawPhoto.sha256)) {
      throw new Error(`Photo "${rawPhoto.path}" must declare a Base64-encoded SHA-256 checksum.`);
    }
    if (
      rawPhoto.imageSize !== undefined &&
      rawPhoto.imageSize !== null &&
      rawPhoto.imageSize !== "compact" &&
      rawPhoto.imageSize !== "medium" &&
      rawPhoto.imageSize !== "large"
    ) {
      throw new Error(`Photo "${rawPhoto.path}" has an invalid imageSize.`);
    }
    return {
      pinRef,
      path: rawPhoto.path,
      contentType: rawPhoto.contentType as PhotoCompanionContentType,
      bytes: rawPhoto.bytes as number,
      sha256: rawPhoto.sha256,
      imageWidth: parseOptionalDimension(rawPhoto.imageWidth, `photos[${index}].imageWidth`),
      imageHeight: parseOptionalDimension(rawPhoto.imageHeight, `photos[${index}].imageHeight`),
      imageSize: rawPhoto.imageSize as PhotoCompanionArchivePhoto["imageSize"],
    };
  });

  const missing = value.missing.map((rawMissing, index): PhotoCompanionArchiveMissing => {
    if (!isRecord(rawMissing)) throw new Error(`manifest.json missing[${index}] must be an object.`);
    const pinRef = parsePinRef(rawMissing.pinRef, `missing[${index}].pinRef`);
    if (typeof rawMissing.reason !== "string" || !MISSING_REASONS.has(rawMissing.reason as PhotoCompanionMissingReason)) {
      throw new Error(`manifest.json missing[${index}] has an unsupported reason.`);
    }
    if (rawMissing.contentType !== null && typeof rawMissing.contentType !== "string") {
      throw new Error(`manifest.json missing[${index}].contentType must be a string or null.`);
    }
    return {
      pinRef,
      reason: rawMissing.reason as PhotoCompanionMissingReason,
      contentType: rawMissing.contentType,
    };
  });

  return {
    format: "tripcast-photo-companion",
    version: 1,
    exportedAt: value.exportedAt,
    selection: { startMs, endMs },
    photos,
    missing,
  };
}

export function validatePath(path: string): string | null {
  if (path.startsWith("/") || path.startsWith("\\")) return "Path starts with slash or backslash";
  if (/^[A-Za-z]:/.test(path)) return "Path uses Windows drive prefix";
  if (path.startsWith("//") || path.startsWith("\\\\")) return "Path uses UNC/network prefix";
  if (path.includes("\\")) return "Path contains backslash";
  if (/%[0-9A-Fa-f]{2}/.test(path)) return "Path contains percent-encoded components";
  if (/[\x00-\x1F\x7F]|[^\x00-\x7F]/.test(path)) {
    return "Path contains control or non-ASCII characters";
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "")) return "Path contains empty segments";
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return "Path contains . or .. segments";
  }
  if (!PHOTO_PATH_PATTERN.test(path)) {
    return "Path does not match canonical pattern photos/<name>.<ext>";
  }
  return null;
}

export function validateMime(contentType: string, path: string): string | null {
  if (!(contentType in PHOTO_MIME_EXTENSIONS)) {
    return `MIME type is not supported: ${contentType}`;
  }
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  const allowedExtensions = PHOTO_MIME_EXTENSIONS[contentType as PhotoCompanionContentType];
  if (!(allowedExtensions as readonly string[]).includes(extension)) {
    return `Extension ${extension} does not match declared MIME ${contentType}`;
  }
  return null;
}

export async function computeSha256Base64(arrayBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}

export const computeSha256 = computeSha256Base64;

function isUnixSymlink(entry: { versionMadeBy: number; externalFileAttribute: number }): boolean {
  const originSystem = entry.versionMadeBy >>> 8;
  if (originSystem !== 3) return false;
  const unixMode = (entry.externalFileAttribute >>> 16) & 0o170000;
  return unixMode === 0o120000;
}

async function readValidatedStructure(zipBlob: Blob) {
  const zipReader = new ZipReader(new BlobReader(zipBlob));
  try {
    const entries = await zipReader.getEntries();
    const seenEntryNames = new Set<string>();
    for (const entry of entries) {
      const lowerName = entry.filename.toLowerCase();
      if (seenEntryNames.has(lowerName)) {
        throw new Error(`Duplicate or case-colliding ZIP entry: ${entry.filename}`);
      }
      seenEntryNames.add(lowerName);
      if (entry.encrypted) throw new Error(`Encrypted entries are not supported: ${entry.filename}`);
      if (isUnixSymlink(entry)) throw new Error(`Symbolic links are not supported: ${entry.filename}`);
    }

    const manifestEntries = entries.filter((entry) => entry.filename === "manifest.json");
    if (manifestEntries.length === 0) throw new Error("Missing manifest.json at ZIP root.");
    if (manifestEntries.length !== 1) throw new Error("ZIP must contain exactly one manifest.json at its root.");
    const manifestEntry = manifestEntries[0];
    if (manifestEntry.directory) throw new Error("manifest.json must be a file.");
    if (manifestEntry.uncompressedSize > MAX_MANIFEST_BYTES) {
      throw new Error("manifest.json exceeds the 5 MiB size limit.");
    }
    if (!manifestEntry.getData) throw new Error("Zip entry reader is missing getData method.");

    let manifestValue: unknown;
    try {
      manifestValue = JSON.parse(await manifestEntry.getData(new TextWriter())) as unknown;
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error("manifest.json is not valid JSON.");
      throw new Error(`Failed to extract manifest.json: ${error instanceof Error ? error.message : String(error)}`);
    }
    const manifest = parseManifest(manifestValue);
    const zipFileEntries = new Map<string, (typeof entries)[number]>();

    for (const entry of entries) {
      if (entry.filename === "manifest.json") continue;
      if (entry.directory) {
        if (entry.filename !== "photos/") throw new Error(`Unexpected directory in ZIP: ${entry.filename}`);
        continue;
      }
      const pathError = validatePath(entry.filename);
      if (pathError) {
        throw new Error(`ZIP contains unsafe or invalid file path "${entry.filename}": ${pathError}`);
      }
      zipFileEntries.set(entry.filename, entry);
    }

    const pinRefs = new Set<string>();
    const manifestPaths = new Set<string>();
    const manifestPathsLower = new Set<string>();
    for (const photo of manifest.photos) {
      if (pinRefs.has(photo.pinRef)) throw new Error(`Duplicate pinRef in manifest: ${photo.pinRef}`);
      pinRefs.add(photo.pinRef);
      if (manifestPaths.has(photo.path)) throw new Error(`Duplicate photo path in manifest: ${photo.path}`);
      const lowerPath = photo.path.toLowerCase();
      if (manifestPathsLower.has(lowerPath)) {
        throw new Error(`Case-insensitive path collision in manifest: ${photo.path}`);
      }
      manifestPaths.add(photo.path);
      manifestPathsLower.add(lowerPath);
      const entry = zipFileEntries.get(photo.path);
      if (!entry) throw new Error(`Manifest lists photo "${photo.path}" but it is missing from the ZIP archive.`);
      if (entry.uncompressedSize !== photo.bytes) {
        throw new Error(
          `Size mismatch for "${photo.path}". Manifest: ${photo.bytes} bytes, ZIP: ${entry.uncompressedSize} bytes.`,
        );
      }
    }
    for (const filename of zipFileEntries.keys()) {
      if (!manifestPaths.has(filename)) {
        throw new Error(`Unexpected file in ZIP not listed in manifest: ${filename}`);
      }
    }

    return {
      zipReader,
      manifest,
      zipFileEntries,
      totalPhotoBytes: manifest.photos.reduce((total, photo) => total + photo.bytes, 0),
    };
  } catch (error) {
    await zipReader.close().catch(() => undefined);
    if (error instanceof Error) throw error;
    throw new Error(`Failed to read ZIP structure: ${String(error)}`);
  }
}

export async function inspectArchiveZip(zipBlob: Blob): Promise<InspectedCompanionZip> {
  const structure = await readValidatedStructure(zipBlob);
  try {
    return { manifest: structure.manifest, totalPhotoBytes: structure.totalPhotoBytes };
  } finally {
    await structure.zipReader.close();
  }
}

export async function validateArchiveZip(
  zipBlob: Blob,
  selectedPinRefs?: ReadonlySet<string>,
): Promise<ValidatedCompanionZip> {
  const structure = await readValidatedStructure(zipBlob);
  const photoBlobs = new Map<string, { blob: Blob; entry: PhotoCompanionArchivePhoto }>();
  const photoErrors = new Map<string, string>();
  try {
    const photos = selectedPinRefs
      ? structure.manifest.photos.filter((photo) => selectedPinRefs.has(photo.pinRef))
      : structure.manifest.photos;
    for (const photo of photos) {
      try {
        const entry = structure.zipFileEntries.get(photo.path)!;
        if (!entry.getData) throw new Error(`Zip entry "${photo.path}" reader is missing getData method.`);
        const blob = await entry.getData(new BlobWriter(photo.contentType));
        const sha256 = await computeSha256Base64(await blob.arrayBuffer());
        if (sha256 !== photo.sha256) {
          throw new Error(
            `SHA-256 checksum mismatch for "${photo.path}". Expected: ${photo.sha256}, Actual: ${sha256}.`,
          );
        }
        photoBlobs.set(photo.pinRef, { blob, entry: photo });
      } catch (error) {
        photoErrors.set(
          photo.pinRef,
          error instanceof Error ? error.message : `Failed to extract photo "${photo.path}".`,
        );
      }
    }
    return {
      manifest: structure.manifest,
      totalPhotoBytes: structure.totalPhotoBytes,
      photoBlobs,
      photoErrors,
    };
  } finally {
    await structure.zipReader.close();
  }
}

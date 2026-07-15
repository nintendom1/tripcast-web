import { ZipReader, BlobReader, TextWriter, BlobWriter, ZipWriter } from "@zip.js/zip.js";

export interface PhotoCompanionArchivePhoto {
  pinRef: string;
  path: string;
  contentType: string;
  bytes: number;
  sha256: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageSize?: "compact" | "medium" | "large" | null;
}

export interface PhotoCompanionArchiveMissing {
  pinRef: string;
  reason: "storage_missing" | "url_unavailable" | "unsupported_content_type" | string;
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

export const PHOTO_MIME_EXTENSIONS = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "image/avif": [".avif"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
} as const;

export function validatePath(path: string): string | null {
  if (path.startsWith('/') || path.startsWith('\\')) {
    return "Path starts with slash or backslash";
  }
  if (/^[A-Za-z]:/.test(path)) {
    return "Path uses Windows drive prefix";
  }
  if (path.startsWith('//') || path.startsWith('\\\\')) {
    return "Path uses UNC/network prefix";
  }
  if (path.includes('\\')) {
    return "Path contains backslash";
  }
  if (/%[0-9A-Fa-f]{2}/.test(path)) {
    return "Path contains percent-encoded components";
  }
  if (/[\x00-\x1F\x7F]|[^\x00-\x7F]/.test(path)) {
    return "Path contains control or non-ASCII characters";
  }

  const segments = path.split('/');
  if (segments.some(s => s === '')) {
    return "Path contains empty segments";
  }
  if (segments.some(s => s === '.' || s === '..')) {
    return "Path contains . or .. segments";
  }
  if (segments[0] !== 'photos') {
    return "Path is outside photos/ directory";
  }
  if (segments.length > 2) {
    return "Path uses nested photo directories";
  }

  const basenameWithExt = segments[1];
  const regex = /^[A-Za-z0-9_-]{1,160}\.(jpg|jpeg|png|webp|gif|avif|heic|heif)$/;
  if (!regex.test(basenameWithExt)) {
    return "Path does not match canonical pattern photos/<name>.<ext>";
  }

  return null;
}

export function validateMime(contentType: string, path: string): string | null {
  if (contentType.includes(';')) {
    return `MIME type contains parameters: ${contentType}`;
  }
  const normalized = contentType.trim().toLowerCase();
  if (!(normalized in PHOTO_MIME_EXTENSIONS)) {
    return `MIME type is not supported: ${contentType}`;
  }
  const allowedExtensions = PHOTO_MIME_EXTENSIONS[normalized as keyof typeof PHOTO_MIME_EXTENSIONS] as readonly string[];
  const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
  if (!allowedExtensions.includes(extension)) {
    return `Extension ${extension} does not match declared MIME ${contentType}`;
  }
  return null;
}

export async function computeSha256(arrayBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface ValidatedCompanionZip {
  manifest: PhotoCompanionArchiveManifest;
  photoBlobs: Map<string, { blob: Blob; entry: PhotoCompanionArchivePhoto }>;
}

export async function validateArchiveZip(zipBlob: Blob): Promise<ValidatedCompanionZip> {
  const zipReader = new ZipReader(new BlobReader(zipBlob));
  let entries;
  try {
    entries = await zipReader.getEntries();
  } catch (err) {
    throw new Error(`Failed to read ZIP structure: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 1. Locate and parse manifest.json
  const manifestEntry = entries.find(e => e.filename === "manifest.json");
  if (!manifestEntry) {
    throw new Error("Missing manifest.json at ZIP root.");
  }
  if (manifestEntry.uncompressedSize > 5 * 1024 * 1024) {
    throw new Error("manifest.json exceeds the 5 MiB size limit.");
  }

  if (!manifestEntry.getData) {
    throw new Error("Zip entry reader is missing getData method.");
  }

  let manifestText: string;
  try {
    manifestText = await manifestEntry.getData(new TextWriter());
  } catch (err) {
    throw new Error(`Failed to extract manifest.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  let manifest: PhotoCompanionArchiveManifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (err) {
    throw new Error("manifest.json is not valid JSON.");
  }

  // 2. Validate manifest header format
  if (manifest.format !== "tripcast-photo-companion" || manifest.version !== 1) {
    throw new Error("Unsupported manifest format or version. Expected format 'tripcast-photo-companion' and version 1.");
  }

  const photos = manifest.photos || [];
  if (photos.length > 8000) {
    throw new Error("Archive contains more than 8,000 photos.");
  }

  // 3. Ensure uniqueness in manifest
  const manifestPinRefs = new Set<string>();
  const manifestPaths = new Set<string>();
  const manifestPathsCaseInsensitive = new Set<string>();

  for (const photo of photos) {
    if (!photo.pinRef) {
      throw new Error("Manifest photo entry is missing pinRef.");
    }
    if (!photo.path) {
      throw new Error(`Manifest photo entry for ${photo.pinRef} is missing path.`);
    }

    if (manifestPinRefs.has(photo.pinRef)) {
      throw new Error(`Duplicate pinRef in manifest: ${photo.pinRef}`);
    }
    manifestPinRefs.add(photo.pinRef);

    const pathError = validatePath(photo.path);
    if (pathError) {
      throw new Error(`Invalid photo path in manifest "${photo.path}": ${pathError}`);
    }

    if (manifestPaths.has(photo.path)) {
      throw new Error(`Duplicate photo path in manifest: ${photo.path}`);
    }
    const lowerPath = photo.path.toLowerCase();
    if (manifestPathsCaseInsensitive.has(lowerPath)) {
      throw new Error(`Case-insensitive path collision in manifest: ${photo.path}`);
    }
    manifestPaths.add(photo.path);
    manifestPathsCaseInsensitive.add(lowerPath);

    const mimeError = validateMime(photo.contentType, photo.path);
    if (mimeError) {
      throw new Error(`Invalid MIME/extension agreement in manifest for "${photo.path}": ${mimeError}`);
    }

    if (photo.bytes > 8 * 1024 * 1024) {
      throw new Error(`Photo "${photo.path}" exceeds the 8 MiB limit.`);
    }
  }

  // 4. Validate ZIP entry safety and match with manifest
  const zipFileEntries = new Map<string, typeof entries[number]>();
  const zipFileEntriesCaseInsensitive = new Map<string, string>();

  for (const entry of entries) {
    if (entry.filename === "manifest.json") continue;
    if (entry.directory) {
      if (entry.filename !== "photos/") {
        throw new Error(`Unexpected directory in ZIP: ${entry.filename}`);
      }
      continue;
    }

    if (entry.encrypted) {
      throw new Error(`Encrypted entries are not supported: ${entry.filename}`);
    }

    const pathError = validatePath(entry.filename);
    if (pathError) {
      throw new Error(`ZIP contains unsafe or invalid file path "${entry.filename}": ${pathError}`);
    }

    const lowerName = entry.filename.toLowerCase();
    if (zipFileEntriesCaseInsensitive.has(lowerName)) {
      throw new Error(`Case-insensitive path collision in ZIP entries: ${entry.filename}`);
    }

    zipFileEntries.set(entry.filename, entry);
    zipFileEntriesCaseInsensitive.set(lowerName, entry.filename);
  }

  // Check that every manifest-listed path corresponds to exactly one ZIP entry
  for (const photo of photos) {
    if (!zipFileEntries.has(photo.path)) {
      throw new Error(`Manifest lists photo "${photo.path}" but it is missing from the ZIP archive.`);
    }
  }

  // Check that there are no extra files in the ZIP absent from the manifest
  const manifestPathSet = new Set(photos.map(p => p.path));
  for (const [filename] of zipFileEntries) {
    if (!manifestPathSet.has(filename)) {
      throw new Error(`Unexpected file in ZIP not listed in manifest: ${filename}`);
    }
  }

  // 5. Extract and verify bytes & SHA-256 for all photos
  const photoBlobs = new Map<string, { blob: Blob; entry: PhotoCompanionArchivePhoto }>();

  for (const photo of photos) {
    const entry = zipFileEntries.get(photo.path)!;

    if (entry.uncompressedSize !== photo.bytes) {
      throw new Error(`Size mismatch for "${photo.path}". Manifest: ${photo.bytes} bytes, ZIP: ${entry.uncompressedSize} bytes.`);
    }

    if (!entry.getData) {
      throw new Error(`Zip entry "${photo.path}" reader is missing getData method.`);
    }

    let blob: Blob;
    try {
      blob = await entry.getData(new BlobWriter(photo.contentType));
    } catch (err) {
      throw new Error(`Failed to extract photo "${photo.path}": ${err instanceof Error ? err.message : String(err)}`);
    }

    const arrayBuffer = await blob.arrayBuffer();
    const sha256 = await computeSha256(arrayBuffer);

    if (sha256 !== photo.sha256) {
      throw new Error(`SHA-256 checksum mismatch for "${photo.path}". Expected: ${photo.sha256}, Actual: ${sha256}.`);
    }

    photoBlobs.set(photo.pinRef, { blob, entry: photo });
  }

  return { manifest, photoBlobs };
}

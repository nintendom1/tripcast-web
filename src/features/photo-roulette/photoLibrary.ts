import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";

export type PhotoAuthorizationStatus =
  | "notDetermined"
  | "limited"
  | "authorized"
  | "denied"
  | "restricted";

export type PhotoAsset = {
  id: string;
  capturedAt: number | null;
  lat: number | null;
  lon: number | null;
  pixelWidth: number;
  pixelHeight: number;
};

export type PhotoThumbnail = {
  id: string;
  data: string | null;
  isInCloud: boolean;
};

export type PreparedPhoto = {
  file: File;
  width: number;
  height: number;
  bytes: number;
  alreadyCompressed: true;
};

type NativePreparedPhoto =
  | { status: "requiresDownload" }
  | {
      status: "ready";
      data: string;
      mimeType: string;
      bytes: number;
      width: number;
      height: number;
    };

interface PhotoLibraryPlugin {
  isAvailable(): Promise<{ value: boolean }>;
  getAuthorizationStatus(): Promise<{ status: PhotoAuthorizationStatus }>;
  requestAuthorization(): Promise<{ status: PhotoAuthorizationStatus }>;
  manageLimitedAccess(): Promise<void>;
  openSettings(): Promise<void>;
  startSession(options?: { cutoffAtMs?: number }): Promise<{ sessionId: string; total: number }>;
  getAssets(options: {
    sessionId: string;
    offset: number;
    limit: number;
  }): Promise<{ assets: PhotoAsset[]; nextOffset: number | null }>;
  getAssetIndex(options: { sessionId: string; assetId: string }): Promise<{ index: number | null }>;
  getThumbnails(options: {
    assetIds: string[];
    pixelWidth: number;
    pixelHeight: number;
  }): Promise<{ thumbnails: Array<{ id: string; data: string | null; isInCloud: boolean }> }>;
  prepareAsset(options: {
    assetId: string;
    networkAccessAllowed: boolean;
  }): Promise<NativePreparedPhoto>;
  cancelPrepare(options: { assetId: string }): Promise<void>;
  endSession(): Promise<void>;
  addListener(
    eventName: "downloadProgress",
    listener: (event: { assetId: string; progress: number }) => void,
  ): Promise<PluginListenerHandle>;
}

const NativePhotoLibrary = registerPlugin<PhotoLibraryPlugin>("PhotoLibrary");

function decodeBase64(data: string, mimeType: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

export function isPhotoRouletteAvailable() {
  return Capacitor.isNativePlatform()
    && Capacitor.getPlatform() === "ios"
    && Capacitor.isPluginAvailable("PhotoLibrary");
}

export type PhotoLibraryAdapter = {
  getAuthorizationStatus(): Promise<PhotoAuthorizationStatus>;
  requestAuthorization(): Promise<PhotoAuthorizationStatus>;
  manageLimitedAccess(): Promise<void>;
  openSettings(): Promise<void>;
  startSession(cutoffAtMs: number | null): Promise<{ sessionId: string; total: number }>;
  getAssets(sessionId: string, offset: number, limit?: number): Promise<{ assets: PhotoAsset[]; nextOffset: number | null }>;
  getAssetIndex(sessionId: string, assetId: string): Promise<number | null>;
  getThumbnails(assetIds: string[], pixelWidth: number, pixelHeight: number): Promise<PhotoThumbnail[]>;
  prepareAsset(assetId: string, networkAccessAllowed: boolean): Promise<PreparedPhoto | "requiresDownload">;
  cancelPrepare(assetId: string): Promise<void>;
  endSession(): Promise<void>;
  onDownloadProgress(listener: (event: { assetId: string; progress: number }) => void): Promise<PluginListenerHandle>;
};

export const photoLibrary: PhotoLibraryAdapter = {
  async getAuthorizationStatus() {
    return (await NativePhotoLibrary.getAuthorizationStatus()).status;
  },
  async requestAuthorization() {
    return (await NativePhotoLibrary.requestAuthorization()).status;
  },
  manageLimitedAccess: () => NativePhotoLibrary.manageLimitedAccess(),
  openSettings: () => NativePhotoLibrary.openSettings(),
  startSession: (cutoffAtMs) => cutoffAtMs === null
    ? NativePhotoLibrary.startSession()
    : NativePhotoLibrary.startSession({ cutoffAtMs }),
  getAssets: (sessionId, offset, limit = 24) => NativePhotoLibrary.getAssets({ sessionId, offset, limit }),
  async getAssetIndex(sessionId, assetId) {
    return (await NativePhotoLibrary.getAssetIndex({ sessionId, assetId })).index;
  },
  async getThumbnails(assetIds, pixelWidth, pixelHeight) {
    const result = await NativePhotoLibrary.getThumbnails({ assetIds, pixelWidth, pixelHeight });
    return result.thumbnails.map((thumbnail) => ({
      ...thumbnail,
      data: thumbnail.data ? `data:image/jpeg;base64,${thumbnail.data}` : null,
    }));
  },
  async prepareAsset(assetId, networkAccessAllowed) {
    const result = await NativePhotoLibrary.prepareAsset({ assetId, networkAccessAllowed });
    if (result.status === "requiresDownload") return "requiresDownload";
    const blob = decodeBase64(result.data, result.mimeType);
    return {
      file: new File([blob], "photo-roulette.jpg", { type: result.mimeType }),
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      alreadyCompressed: true,
    };
  },
  cancelPrepare: (assetId) => NativePhotoLibrary.cancelPrepare({ assetId }),
  endSession: () => NativePhotoLibrary.endSession(),
  onDownloadProgress: (listener) => NativePhotoLibrary.addListener("downloadProgress", listener),
};

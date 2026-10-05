import type { ConvexReactClient } from "convex/react";
import { tripcastApi, type ReplayImageInventoryItem } from "../../convex/tripcastApi";

export async function encodeReplayImage(input: Blob) {
  // ImageBitmap applies EXIF orientation and uses a static frame for animation.
  const bitmap = await createImageBitmap(input, { imageOrientation: "from-image" });
  try {
    for (let maximum = 960; maximum >= 240; maximum = Math.floor(maximum * 0.8)) {
      const ratio = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * ratio));
      const height = Math.max(1, Math.round(bitmap.height * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image conversion is unavailable in this browser.");
      context.fillStyle = "white";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      for (const quality of [0.8, 0.7, 0.6, 0.5]) {
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("JPEG encoding failed.")), "image/jpeg", quality));
        if (blob.type === "image/jpeg" && blob.size <= 100_000) return { blob, width, height };
      }
    }
    throw new Error("Could not prepare a preview under 100 KB.");
  } finally {
    bitmap.close();
  }
}

export type PreparationState = { running: boolean; stopping: boolean; completed: number; total: number; error: string | null; source: string | null };
let state: PreparationState = { running: false, stopping: false, completed: 0, total: 0, error: null, source: null };
let signOutEpoch = 0;
const listeners = new Set<() => void>();
export const preparationStore = {
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getSnapshot: () => state,
  stop: () => update({ stopping: true }),
};
function update(patch: Partial<PreparationState>) { state = { ...state, ...patch }; listeners.forEach(listener => listener()); }
export async function readPreparationInventory(client: ConvexReactClient, token: string) {
  const unique = new Map<string, ReplayImageInventoryItem>();
  let cursor: string | null = null;
  for (;;) {
    const page: { page: ReplayImageInventoryItem[]; isDone: boolean; continueCursor: string } = await client.query(tripcastApi.replayImages.inventory, { token, paginationOpts: { numItems: 64, cursor } });
    page.page.forEach(item => unique.set(item.source, item));
    if (page.isDone) return [...unique.values()];
    cursor = page.continueCursor;
  }
}
export async function prepareReplayImages(client: ConvexReactClient, token: string, sources: string[], local?: { source: string; blob: Blob }) {
  if (state.running) return;
  update({ running: true, stopping: false, completed: 0, total: sources.length, error: null });
  const epoch = signOutEpoch;
  const owner = crypto.randomUUID();
  let acquired = false;
  try {
    acquired = await client.mutation(tripcastApi.replayImages.acquire, { token, owner });
    if (!acquired) throw new Error("Preparation is running in another tab or device. Resume after it finishes or its five-minute lease expires.");
    for (const source of sources) {
      if (state.stopping || epoch !== signOutEpoch) break;
      update({ source });
      const claim = await client.mutation(tripcastApi.replayImages.claim, { token, owner, source });
      if (claim) {
        try {
          let input = local?.source === source ? local.blob : undefined;
          if (!input) {
            if (!claim.originalUrl) throw new Error("Original photo is missing.");
            const response = await fetch(claim.originalUrl);
            if (!response.ok) throw new Error("Original photo download failed.");
            input = await response.blob();
          }
          const preview = await encodeReplayImage(input);
          if (epoch !== signOutEpoch) break;
          const accepted = await client.action(tripcastApi.replayImages.finish, { token, owner, source, bytes: await preview.blob.arrayBuffer(), width: preview.width, height: preview.height });
          if (!accepted) throw new Error("Photo changed during preparation. Refresh and retry.");
        } catch (error) {
          if (epoch !== signOutEpoch) break;
          await client.mutation(tripcastApi.replayImages.fail, { token, owner, source });
          update({ error: error instanceof Error ? error.message : String(error) });
        }
      }
      update({ completed: state.completed + 1 });
    }
  } catch (error) {
    update({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    if (acquired) await client.mutation(tripcastApi.replayImages.release, { token, owner }).catch(() => undefined);
    const stopped = state.stopping || epoch !== signOutEpoch;
    update({ running: false, stopping: false, source: null });
    if (!stopped) {
      const next = queuedUploads.entries().next().value;
      if (next) {
        queuedUploads.delete(next[0]);
        void prepareReplayImages(next[1].client, next[1].token, [next[0]], next[1].blob ? { source: next[0], blob: next[1].blob } : undefined);
      }
    }
  }
}

// Keep only a few just-uploaded blobs until the Story mutation attaches them.
const uploadedSources = new Map<string, Blob>();
const queuedUploads = new Map<string, { client: ConvexReactClient; token: string; blob?: Blob }>();
export function rememberReplaySource(source: string, blob: Blob) {
  uploadedSources.set(source, blob);
  while (uploadedSources.size > 8) uploadedSources.delete(uploadedSources.keys().next().value!);
}
export function prepareUploadedReplayImage(client: ConvexReactClient, token: string, source: string) {
  const blob = uploadedSources.get(source);
  uploadedSources.delete(source);
  if (state.running) { queuedUploads.set(source, { client, token, blob }); return; }
  // A competing device leaves this source pending in the inventory for resumption.
  void prepareReplayImages(client, token, [source], blob ? { source, blob } : undefined);
}

export function stopReplayPreparationForSignOut() {
  signOutEpoch += 1;
  update({ stopping: true });
  uploadedSources.clear();
  queuedUploads.clear();
}

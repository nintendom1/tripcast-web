export interface PendingSave {
  id: string;
  data: {
    title?: string;
    note?: string;
    locationLabel?: string;
    showInStory: boolean;
    lat: number;
    lon: number;
    imageSize: "compact" | "medium" | "large";
    source: string;
    missionId?: string;
    happenedAt?: number;
    // For traveler state
    moodValue?: string;
    energyLevel?: string;
    stomachLevel?: string;
    stressLevel?: string;
    schedulePressureLevel?: string;
    statusNote?: string;
    // For regressions fixed
    stagedTransactionIds?: string[];
    awardBadgeType?: string;
    prefill?: {
      completeMission?: boolean;
      mysteryReveal?: boolean;
    };
  };
  imageBlob?: Blob;
  imageType?: string;
  status: "uploading" | "saving" | "failed" | "link-failed";
  progress: number; // 0 to 100
  error?: string;
  createdAt: number;
  // Crash recovery: persisted after checkpoint creation, before transaction linking
  checkpointId?: string;
  linkStatus?: "pending" | "failed" | "ok";
  // Exponential backoff
  retryCount: number;
  nextRetryAt?: number; // epoch ms; when set, auto-retry fires after this time
}

const DB_NAME = "tripcast_bg_saves";
const STORE_NAME = "saves";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

export async function savePendingSave(save: PendingSave): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(save);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function deletePendingSave(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getAllPendingSaves(): Promise<PendingSave[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

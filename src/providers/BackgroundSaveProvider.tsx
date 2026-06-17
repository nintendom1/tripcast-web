import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import {
  PendingSave,
  savePendingSave,
  deletePendingSave,
  getAllPendingSaves
} from "../lib/idb";
import { useMutation } from "convex/react";
import { tripcastApi } from "../convex/tripcastApi";
import { uploadStoryImage } from "../features/journal/storyImageUpload";
import { registerPlugin } from "@capacitor/core";

interface LiveActivityPlugin {
  isAvailable(): Promise<{ value: boolean }>;
  startUploadActivity(options: { title: string; status: string }): Promise<{ id: string }>;
  updateUploadActivity(options: { id: string; status: string; progress: number }): Promise<void>;
  endUploadActivity(options: { id: string }): Promise<void>;
}

const LiveActivity = registerPlugin<LiveActivityPlugin>("LiveActivity");

// Local-dev latency / chaos simulation. All zero by default → no-op in prod
// builds (Vite bakes env vars at build time; unset = 0). See
// docs/background-uploads.md for usage.
const SIM_SLOW_MS = Number(import.meta.env.VITE_BG_SAVE_SLOW_MS ?? 0);
const SIM_FAIL_RATE = Number(import.meta.env.VITE_BG_SAVE_FAIL_RATE ?? 0);
const SIM_LINK_FAIL_RATE = Number(import.meta.env.VITE_BG_SAVE_LINK_FAIL_RATE ?? 0);
const simSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
function simMaybeFail(rate: number, message: string) {
  if (rate > 0 && Math.random() < rate) throw new Error(message);
}
if (import.meta.env.DEV && (SIM_SLOW_MS || SIM_FAIL_RATE || SIM_LINK_FAIL_RATE)) {
  // eslint-disable-next-line no-console
  console.info(
    `[BackgroundSave SIM] slow=${SIM_SLOW_MS}ms fail=${SIM_FAIL_RATE} linkFail=${SIM_LINK_FAIL_RATE}`,
  );
}

interface BackgroundSaveContextType {
  saves: PendingSave[];
  startSave: (data: PendingSave["data"], file?: File, onComplete?: (id: string, prefill?: any) => void) => Promise<string>;
  retrySave: (id: string) => Promise<void>;
  dismissSave: (id: string) => Promise<void>;
}

const BackgroundSaveContext = createContext<BackgroundSaveContextType | undefined>(undefined);

export function useBackgroundSave() {
  const context = useContext(BackgroundSaveContext);
  if (!context) {
    throw new Error("useBackgroundSave must be used within a BackgroundSaveProvider");
  }
  return context;
}

export function BackgroundSaveProvider({ children, token }: { children: React.ReactNode, token: string }) {
  const [saves, setSaves] = useState<PendingSave[]>([]);
  const completionCallbacks = useRef<Record<string, (id: string, prefill?: any) => void>>({});
  const retryingIds = useRef<Set<string>>(new Set());
  const savesRef = useRef<PendingSave[]>([]);

  const generateUploadUrl = useMutation(tripcastApi.checkpoints.generateStoryImageUploadUrl);
  const addCheckpoint = useMutation(tripcastApi.checkpoints.addCheckpoint);
  const completeMissionAsStory = useMutation(tripcastApi.missions.travelerCompleteMissionAsStory);
  const updateTransaction = useMutation(tripcastApi.travelFunds.travelerUpdateTransaction);

  // Keep savesRef in sync for the auto-retry interval
  useEffect(() => { savesRef.current = saves; }, [saves]);

  // Load pending saves from IndexedDB on mount and auto-resume interrupted ones.
  useEffect(() => {
    getAllPendingSaves().then(loadedSaves => {
      setSaves(loadedSaves);
      loadedSaves.forEach(save => {
        if (save.status === "uploading" || save.status === "saving") {
          performSave(save);
        }
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const performSave = useCallback(async (save: PendingSave) => {
    let activityId: string | undefined;
    try {
      try {
        const { value: available } = await LiveActivity.isAvailable();
        if (available) {
          const { id } = await LiveActivity.startUploadActivity({
            title: save.data.title || "New Pin",
            status: "Uploading photo...",
          });
          activityId = id;
        }
      } catch (e) {
        // Plugin not registered — ignore
      }

      let checkpointId: string;

      if (save.checkpointId) {
        // Link-failed retry: checkpoint already created, skip straight to transaction linking
        checkpointId = save.checkpointId;
        setSaves(prev => prev.map(s => s.id === save.id ? { ...s, status: "saving", progress: 80 } : s));
        await savePendingSave({ ...save, status: "saving", progress: 80 });
      } else {
        // Full path: upload image → create checkpoint
        let imageId: string | undefined;
        let imageWidth: number | undefined;
        let imageHeight: number | undefined;

        if (save.imageBlob) {
          setSaves(prev => prev.map(s => s.id === save.id ? { ...s, status: "uploading", progress: 10 } : s));
          await savePendingSave({ ...save, status: "uploading", progress: 10 });

          if (SIM_SLOW_MS > 0) await simSleep(SIM_SLOW_MS / 2);
          simMaybeFail(SIM_FAIL_RATE, "[sim] Upload failed");

          const file = new File([save.imageBlob], "image.jpg", { type: save.imageType });
          const uploadResult = await uploadStoryImage(file, () => generateUploadUrl({ token }));
          imageId = uploadResult.storageId;
          imageWidth = uploadResult.width;
          imageHeight = uploadResult.height;

          setSaves(prev => prev.map(s => s.id === save.id ? { ...s, progress: 50 } : s));
          await savePendingSave({ ...save, status: "uploading", progress: 50 });

          if (activityId) {
            await LiveActivity.updateUploadActivity({ id: activityId, status: "Photo uploaded", progress: 0.5 }).catch(() => {});
          }
        }

        setSaves(prev => prev.map(s => s.id === save.id ? { ...s, status: "saving", progress: 70 } : s));
        await savePendingSave({ ...save, status: "saving", progress: 70 });

        if (activityId) {
          await LiveActivity.updateUploadActivity({ id: activityId, status: "Saving pin...", progress: 0.8 }).catch(() => {});
        }

        if (SIM_SLOW_MS > 0) await simSleep(SIM_SLOW_MS / 2);
        simMaybeFail(SIM_FAIL_RATE, "[sim] Checkpoint mutation failed");

        if (save.data.missionId && save.data.prefill?.completeMission !== false) {
          checkpointId = await completeMissionAsStory({
            token,
            missionId: save.data.missionId,
            title: save.data.title,
            note: save.data.note,
            locationLabel: save.data.locationLabel,
            lat: save.data.lat,
            lon: save.data.lon,
            source: save.data.source as any,
            imageId,
            imageWidth,
            imageHeight,
            awardBadgeType: save.data.awardBadgeType as any,
          });
        } else {
          // Explicitly pass only the fields the Convex validator accepts.
          // save.data also holds IDB-only fields (stagedTransactionIds, prefill,
          // awardBadgeType) that must not be spread into the mutation.
          checkpointId = await addCheckpoint({
            token,
            source: save.data.source as any,
            lat: save.data.lat,
            lon: save.data.lon,
            title: save.data.title,
            note: save.data.note,
            locationLabel: save.data.locationLabel,
            showInStory: save.data.showInStory,
            imageSize: save.data.imageSize,
            imageId,
            imageWidth,
            imageHeight,
            happenedAt: save.data.happenedAt,
            missionId: save.data.missionId as any,
            moodValue: save.data.moodValue as any,
            energyLevel: save.data.energyLevel as any,
            stomachLevel: save.data.stomachLevel as any,
            stressLevel: save.data.stressLevel as any,
            schedulePressureLevel: save.data.schedulePressureLevel as any,
            statusNote: save.data.statusNote,
          } as any);
        }

        // Persist checkpointId before linking — crash-safe two-phase commit
        const withCheckpoint = { ...save, checkpointId, linkStatus: "pending" as const, progress: 80 };
        setSaves(prev => prev.map(s => s.id === save.id ? withCheckpoint : s));
        await savePendingSave(withCheckpoint);
      }

      // Link staged transactions
      let linkFailed = false;
      if (save.data.stagedTransactionIds?.length) {
        for (const txId of save.data.stagedTransactionIds) {
          try {
            await updateTransaction({ token, transactionId: txId as any, linkedCheckpointId: checkpointId });
          } catch (e) {
            console.error("Failed to link transaction in background:", e);
            linkFailed = true;
          }
        }
        if (SIM_LINK_FAIL_RATE > 0 && Math.random() < SIM_LINK_FAIL_RATE) {
          linkFailed = true;
        }
      }

      if (linkFailed) {
        const retryCount = (save.retryCount ?? 0) + 1;
        const nextRetryAt = Date.now() + Math.min(Math.pow(2, retryCount) * 2000, 30000);
        const linkFailedSave: PendingSave = {
          ...save,
          checkpointId,
          linkStatus: "failed",
          status: "link-failed",
          error: "Pin saved, but spend tracking failed — tap Retry to relink.",
          progress: 0,
          retryCount,
          nextRetryAt,
        };
        setSaves(prev => prev.map(s => s.id === save.id ? linkFailedSave : s));
        await savePendingSave(linkFailedSave);
        // Checkpoint created successfully — fire callback and event for mission completion UX
        const hasCallback = Boolean(completionCallbacks.current[save.id]);
        completionCallbacks.current[save.id]?.(checkpointId, save.data.prefill);
        delete completionCallbacks.current[save.id];
        window.dispatchEvent(new CustomEvent("tripcast:bg-save-complete", {
          detail: { id: save.id, checkpointId, missionId: save.data.missionId, prefill: save.data.prefill, wasRestoredFromIDB: !hasCallback },
        }));
        if (activityId) await LiveActivity.endUploadActivity({ id: activityId }).catch(() => {});
        return;
      }

      // Full success
      setSaves(prev => prev.filter(s => s.id !== save.id));
      await deletePendingSave(save.id);

      const hasCallback = Boolean(completionCallbacks.current[save.id]);
      completionCallbacks.current[save.id]?.(checkpointId, save.data.prefill);
      delete completionCallbacks.current[save.id];

      if (activityId) await LiveActivity.endUploadActivity({ id: activityId }).catch(() => {});

      window.dispatchEvent(new CustomEvent("tripcast:bg-save-complete", {
        detail: { id: save.id, checkpointId, missionId: save.data.missionId, prefill: save.data.prefill, wasRestoredFromIDB: !hasCallback },
      }));

    } catch (error) {
      if (activityId) {
        await LiveActivity.updateUploadActivity({ id: activityId, status: "Save failed", progress: 0 }).catch(() => {});
      }
      console.error("Background save failed:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const retryCount = (save.retryCount ?? 0) + 1;
      const nextRetryAt = Date.now() + Math.min(Math.pow(2, retryCount) * 2000, 30000);
      const failedSave: PendingSave = { ...save, status: "failed", error: errorMessage, progress: 0, retryCount, nextRetryAt };
      setSaves(prev => prev.map(s => s.id === save.id ? failedSave : s));
      await savePendingSave(failedSave);
    }
  }, [token, generateUploadUrl, addCheckpoint, completeMissionAsStory, updateTransaction]);

  // Auto-retry saves whose backoff timer has expired
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      savesRef.current.forEach(save => {
        if (
          (save.status === "failed" || save.status === "link-failed") &&
          save.nextRetryAt !== undefined &&
          save.nextRetryAt <= now &&
          !retryingIds.current.has(save.id)
        ) {
          retryingIds.current.add(save.id);
          const saveToRetry = { ...save, nextRetryAt: undefined };
          savePendingSave(saveToRetry).catch(console.error);
          setSaves(prev => prev.map(s => s.id === save.id ? saveToRetry : s));
          performSave(saveToRetry).finally(() => {
            retryingIds.current.delete(save.id);
          });
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [performSave]);

  const startSave = useCallback(async (data: PendingSave["data"], file?: File, onComplete?: (id: string, prefill?: any) => void) => {
    const id = crypto.randomUUID();
    if (onComplete) {
      completionCallbacks.current[id] = onComplete;
    }
    const newSave: PendingSave = {
      id,
      data,
      imageBlob: file,
      imageType: file?.type,
      status: "uploading",
      progress: 0,
      createdAt: Date.now(),
      retryCount: 0,
    };

    setSaves(prev => [...prev, newSave]);
    await savePendingSave(newSave);

    performSave(newSave);

    return id;
  }, [performSave]);

  const retrySave = useCallback(async (id: string) => {
    const save = savesRef.current.find(s => s.id === id);
    if (!save || retryingIds.current.has(id)) return;
    retryingIds.current.add(id);
    const saveToRetry = { ...save, nextRetryAt: undefined };
    setSaves(prev => prev.map(s => s.id === id ? saveToRetry : s));
    await savePendingSave(saveToRetry);
    performSave(saveToRetry).finally(() => {
      retryingIds.current.delete(id);
    });
  }, [performSave]);

  const dismissSave = useCallback(async (id: string) => {
    setSaves(prev => prev.filter(s => s.id !== id));
    await deletePendingSave(id);
  }, []);

  const value = {
    saves,
    startSave,
    retrySave,
    dismissSave,
  };

  return (
    <BackgroundSaveContext.Provider value={value}>
      {children}
    </BackgroundSaveContext.Provider>
  );
}

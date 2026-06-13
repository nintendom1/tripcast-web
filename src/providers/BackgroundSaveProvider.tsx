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
  const generateUploadUrl = useMutation(tripcastApi.checkpoints.generateStoryImageUploadUrl);
  const addCheckpoint = useMutation(tripcastApi.checkpoints.addCheckpoint);
  const completeMissionAsStory = useMutation(tripcastApi.missions.travelerCompleteMissionAsStory);
  const updateTransaction = useMutation(tripcastApi.travelFunds.travelerUpdateTransaction);

  // Load pending saves from IndexedDB on mount
  useEffect(() => {
    getAllPendingSaves().then(loadedSaves => {
      // Filter out saves that might have completed but weren't deleted
      // or are very old. For now just load all.
      setSaves(loadedSaves);

      // Automatically retry any that were "uploading" or "saving" when app closed
      loadedSaves.forEach(save => {
        if (save.status === "uploading" || save.status === "saving") {
          performSave(save);
        }
      });
    });
  }, []);

  const performSave = useCallback(async (save: PendingSave) => {
    let activityId: string | undefined;
    try {
      // Start iOS Live Activity if supported
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
        // Plugin not registered or other error, ignore
      }

      let imageId: string | undefined;

      if (save.imageBlob) {
        setSaves(prev => prev.map(s => s.id === save.id ? { ...s, status: "uploading", progress: 10 } : s));
        await savePendingSave({ ...save, status: "uploading", progress: 10 });

        const file = new File([save.imageBlob], "image.jpg", { type: save.imageType });

        // Mock progress since uploadStoryImage doesn't support it yet
        // In a real scenario, we'd use XMLHttpRequest for progress
        imageId = await uploadStoryImage(file, () => generateUploadUrl({ token }));

        setSaves(prev => prev.map(s => s.id === save.id ? { ...s, progress: 50 } : s));
        await savePendingSave({ ...save, status: "uploading", progress: 50 });

        if (activityId) {
          await LiveActivity.updateUploadActivity({
            id: activityId,
            status: "Photo uploaded",
            progress: 0.5,
          }).catch(() => {});
        }
      }

      setSaves(prev => prev.map(s => s.id === save.id ? { ...s, status: "saving", progress: 70 } : s));
      await savePendingSave({ ...save, status: "saving", progress: 70 });

      if (activityId) {
        await LiveActivity.updateUploadActivity({
          id: activityId,
          status: "Saving pin...",
          progress: 0.8,
        }).catch(() => {});
      }

      let checkpointId: string;
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
          awardBadgeType: save.data.awardBadgeType as any,
        });
      } else {
        checkpointId = await addCheckpoint({
          ...save.data,
          token,
          imageId,
          source: save.data.source as any,
        } as any);
      }

      // Link transactions if any
      if (save.data.stagedTransactionIds) {
        for (const txId of save.data.stagedTransactionIds) {
          try {
            await updateTransaction({
              token,
              transactionId: txId as any,
              linkedCheckpointId: checkpointId,
            });
          } catch (e) {
            console.error("Failed to link transaction in background:", e);
          }
        }
      }

      // Success!
      setSaves(prev => prev.filter(s => s.id !== save.id));
      await deletePendingSave(save.id);

      // Call completion callback if it exists in the current session
      completionCallbacks.current[save.id]?.(checkpointId, save.data.prefill);
      delete completionCallbacks.current[save.id];

      // Success!
      if (activityId) {
        await LiveActivity.endUploadActivity({ id: activityId }).catch(() => {});
      }

      // Dispatch a custom event to notify components that a save finished
      window.dispatchEvent(new CustomEvent("tripcast:bg-save-complete", { detail: { id: save.id, checkpointId } }));

    } catch (error) {
      if (activityId) {
        await LiveActivity.updateUploadActivity({
          id: activityId,
          status: "Save failed",
          progress: 0,
        }).catch(() => {});
        // Optionally end it after a delay or let the user see the failure
      }
      console.error("Background save failed:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setSaves(prev => prev.map(s => s.id === save.id ? { ...s, status: "failed", error: errorMessage, progress: 0 } : s));
      await savePendingSave({ ...save, status: "failed", error: errorMessage, progress: 0 });
    }
  }, [token, generateUploadUrl, addCheckpoint, completeMissionAsStory]);

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
    };

    setSaves(prev => [...prev, newSave]);
    await savePendingSave(newSave);

    // Don't await performSave here, let it run in background
    performSave(newSave);

    return id;
  }, [performSave]);

  const retrySave = useCallback(async (id: string) => {
    const save = saves.find(s => s.id === id);
    if (save) {
      performSave(save);
    }
  }, [saves, performSave]);

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

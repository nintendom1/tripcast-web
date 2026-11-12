import { prepareUploadedReplayImage } from "../features/journal/replayImagePreparation";
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  PendingSave,
  savePendingSave,
  deletePendingSave,
  getAllPendingSaves
} from "../lib/idb";
import { useConvex, useMutation } from "convex/react";
import { tripcastApi } from "../convex/tripcastApi";
import { tripClientFor, useTripMutation } from "../convex/useTrip";
import { sessionScope, useOptionalTripContext } from "./TripContextProvider";
import type { TripTarget } from "../features/trips/tripTypes";
import { tripErrorInfo } from "../features/trips/tripSwitchState";
import { getNativePublishingTags } from "../native/nativePublishingSignal";
import { uploadStoryImage, type StoryImageDraft } from "../features/journal/storyImageUpload";
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

/** A save removed from the queue because its trip no longer exists; `message` names the trip. */
export interface BackgroundSaveNotice {
  id: string;
  message: string;
}

interface BackgroundSaveContextType {
  saves: PendingSave[];
  /**
   * `trip` is the trip the form was opened on (the caller's captured target); the save is stamped with it and always
   * sent there. A caller that passes none gets the viewed trip at enqueue time (a Traveler with multi-trip on only).
   */
  startSave: (data: PendingSave["data"], image?: StoryImageDraft, onComplete?: (id: string, prefill?: any) => void, trip?: TripTarget | null) => Promise<string>;
  /**
   * Re-sends a queued save as it was made (its trip, time, linked expenses). `trip` is a trip the Traveler explicitly
   * chose for a save that has none and no Story yet (one that couldn't be placed); it is stamped before sending.
   */
  retrySave: (id: string, trip?: TripTarget | null) => Promise<void>;
  dismissSave: (id: string) => Promise<void>;
  /** Saves dropped because their trip was deleted, for the HUD to show until dismissed. */
  notices: BackgroundSaveNotice[];
  dismissNotice: (id: string) => void;
}

/** An untagged save that cannot be placed on a trip yet or at all: kept in the queue and surfaced, never sent. */
class UnplacedSaveError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

/**
 * Undismissed notices, per session (`sessionScope`): the dropped save is already gone from IndexedDB, so the notice is
 * its only trace and must survive a reload until the Traveler dismisses it. No key is written while there are none.
 */
const NOTICES_KEY_PREFIX = "tripcast.bg-save-notices.";

function readNotices(scope: string): BackgroundSaveNotice[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(NOTICES_KEY_PREFIX + scope) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((n): n is BackgroundSaveNotice => typeof n?.id === "string" && typeof n?.message === "string")
      : [];
  } catch {
    return [];
  }
}

function writeNotices(scope: string, notices: BackgroundSaveNotice[]) {
  try {
    const key = NOTICES_KEY_PREFIX + scope;
    const value = notices.length > 0 ? JSON.stringify(notices) : null;
    if (localStorage.getItem(key) === value) return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the notice still shows until this app closes.
  }
}

/** Message of an older untagged save whose trip could not be told (its trip is gone or being deleted). */
const UNPLACED_SAVE_MESSAGE = "Couldn't tell which trip this save belongs to. Choose where to save it, or dismiss it.";

/**
 * True for a failed save that could not be placed on any trip: it is never re-sent on its own, only to a trip the
 * Traveler chooses (`retrySave(id, trip)`) or dismissed.
 */
export function isUnplacedSave(save: PendingSave): boolean {
  return save.status === "failed" && !save.tripId && !save.checkpointId && save.error === UNPLACED_SAVE_MESSAGE;
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

  // Restored on mount and written back on every change, for this session only (another account never sees them).
  const noticeScope = useMemo(() => sessionScope(token), [token]);
  const [noticeState, setNoticeState] = useState(() => ({ scope: noticeScope, notices: readNotices(noticeScope) }));
  if (noticeState.scope !== noticeScope) setNoticeState({ scope: noticeScope, notices: readNotices(noticeScope) });
  const notices = noticeState.scope === noticeScope ? noticeState.notices : [];
  useEffect(() => {
    writeNotices(noticeState.scope, noticeState.notices);
  }, [noticeState]);

  const replayImageClient = useConvex();
  const generateUploadUrl = useMutation(tripcastApi.checkpoints.generateStoryImageUploadUrl);
  // These hooks capture the trip once at mount, so every call below passes the SAVE's own `tripId` explicitly (an
  // explicit one wins): a save is never sent to the view or the shared trip at send time.
  const addCheckpoint = useTripMutation(tripcastApi.checkpoints.addCheckpoint);
  const completeMissionAsStory = useTripMutation(tripcastApi.missions.travelerCompleteMissionAsStory);
  const updateTransaction = useTripMutation(tripcastApi.travelFunds.travelerUpdateTransaction);

  // The latest trip context, read at enqueue time (default trip) and for messages; never to pick where to send.
  const tripContext = useOptionalTripContext();
  const tripContextRef = useRef(tripContext);
  useEffect(() => { tripContextRef.current = tripContext; }, [tripContext]);

  // Keep savesRef in sync for the auto-retry interval
  useEffect(() => { savesRef.current = saves; }, [saves]);

  // Names the save's trip for messages when it is not the trip on screen.
  const offScreenTripTitle = useCallback(
    (s: PendingSave): string | null =>
      s.tripId && s.tripTitle && s.tripId !== tripContextRef.current.viewingTrip?.tripId ? s.tripTitle : null,
    [],
  );

  // Gives an untagged (older) save its trip: none with multi-trip off or for a Follower (as today); otherwise the
  // trip current at the save's own time, asked once and stored. No answer keeps the save and surfaces it.
  // A save whose Story already landed (`checkpointId`) is not placed: that checkpoint went to whatever trip was
  // current when the old build sent it, which `createdAt` may not name; its expense update goes untagged instead.
  const placeSave = useCallback(async (s: PendingSave): Promise<PendingSave> => {
    if (s.tripId || s.checkpointId) return s;
    const context = tripContextRef.current;
    if (context.role !== "traveler") return s;
    if (context.serverTripStatus !== undefined && context.serverTripStatus !== "known") {
      // Trip state unknown (cold start, failing subscription). Wait only on a device that can be multi-trip: the
      // bridge remembers its trip tags from earlier launches. With none remembered (disabled, never multi-trip) send
      // as today, immediately.
      if (getNativePublishingTags() === null) return s;
      throw new UnplacedSaveError("Waiting to learn which trip this save belongs to.", true);
    }
    if (!context.multiTripEnabled) return s;
    const resolved = await replayImageClient.query(tripcastApi.trips.resolveTripAt, { token, at: s.createdAt });
    if (!resolved) {
      throw new UnplacedSaveError(UNPLACED_SAVE_MESSAGE, false);
    }
    const title = [context.currentTrip, context.viewingTrip].find((t) => t?.tripId === resolved.tripId)?.title;
    const placed: PendingSave = { ...s, tripId: resolved.tripId, ...(title ? { tripTitle: title } : {}) };
    setSaves(prev => prev.map(x => x.id === s.id ? placed : x));
    await savePendingSave(placed);
    return placed;
  }, [replayImageClient, token]);

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

  const performSave = useCallback(async (initialSave: PendingSave) => {
    let save = initialSave;
    let activityId: string | undefined;
    try {
      save = await placeSave(save);
      // The save's own trip, named explicitly on every trip call below (nothing when it has none: as today).
      const tripArg = save.tripId ? { tripId: save.tripId } : {};
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
          const uploadResult = await uploadStoryImage(
            file,
            () => generateUploadUrl({ token }),
            {
              width: save.imageWidth,
              height: save.imageHeight,
              alreadyCompressed: save.imageAlreadyCompressed,
            },
          );
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
            ...tripArg,
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
            ...tripArg,
          } as any);
        }

        if (imageId) {
          prepareUploadedReplayImage(
            replayImageClient,
            token,
            imageId,
            save.tripId ? tripClientFor(replayImageClient, save.tripId) : undefined,
          );
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
            if (save.tripId) {
              await updateTransaction({ token, transactionId: txId as any, linkedCheckpointId: checkpointId, tripId: save.tripId });
            } else {
              // Untagged save (disabled, or an older save whose Story already landed): send the update untagged, as
              // before multi-trip; the backend resolves an untagged edit to the row's own trip. The plain client, since
              // the trip hooks would add the trip captured when this provider mounted.
              // trip-audit-ok: untagged save; the backend edits the row's own trip
              await replayImageClient.mutation(tripcastApi.travelFunds.travelerUpdateTransaction, {
                token,
                transactionId: txId as any,
                linkedCheckpointId: checkpointId,
              });
            }
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
          error: `Pin saved${offScreenTripTitle(save) ? ` to ${offScreenTripTitle(save)}` : ""}, but spend tracking failed — tap Retry to relink.`,
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
          detail: { id: save.id, checkpointId, missionId: save.data.missionId, prefill: save.data.prefill, wasRestoredFromIDB: !hasCallback, tripId: save.tripId, tripTitle: save.tripTitle },
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
        detail: { id: save.id, checkpointId, missionId: save.data.missionId, prefill: save.data.prefill, wasRestoredFromIDB: !hasCallback, tripId: save.tripId, tripTitle: save.tripTitle },
      }));

    } catch (error) {
      if (activityId) {
        await LiveActivity.updateUploadActivity({ id: activityId, status: "Save failed", progress: 0 }).catch(() => {});
      }
      console.error("Background save failed:", error);
      if (save.tripId && tripErrorInfo(error).code === "trip_not_found") {
        // The trip was deleted: this save can never land. Remove it and say which trip it was for.
        const where = save.tripTitle ?? "its trip";
        setSaves(prev => prev.filter(s => s.id !== save.id));
        await deletePendingSave(save.id);
        delete completionCallbacks.current[save.id];
        const message = `A save for ${where} was removed because that trip no longer exists.`;
        setNoticeState(prev => ({ ...prev, notices: [...prev.notices.filter(n => n.id !== save.id), { id: save.id, message }] }));
        window.dispatchEvent(new CustomEvent("tripcast:bg-save-dropped", {
          detail: { id: save.id, tripId: save.tripId, tripTitle: save.tripTitle, message },
        }));
        tripContextRef.current.reportTripUnavailable?.(save.tripId);
        return;
      }
      const baseMessage = error instanceof Error ? error.message : String(error);
      const where = offScreenTripTitle(save);
      const errorMessage = where ? `${baseMessage} (${where})` : baseMessage;
      const retryCount = (save.retryCount ?? 0) + 1;
      // A save that cannot be placed on a trip is not retried on a timer: the Traveler retries or dismisses it.
      const nextRetryAt = error instanceof UnplacedSaveError && !error.retryable
        ? undefined
        : Date.now() + Math.min(Math.pow(2, retryCount) * 2000, 30000);
      const failedSave: PendingSave = { ...save, status: "failed", error: errorMessage, progress: 0, retryCount, nextRetryAt };
      setSaves(prev => prev.map(s => s.id === save.id ? failedSave : s));
      await savePendingSave(failedSave);
    }
  }, [token, generateUploadUrl, addCheckpoint, completeMissionAsStory, updateTransaction, replayImageClient, placeSave, offScreenTripTitle]);

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

  const startSave = useCallback(async (data: PendingSave["data"], image?: StoryImageDraft, onComplete?: (id: string, prefill?: any) => void, trip?: TripTarget | null) => {
    const id = crypto.randomUUID();
    // Stamp the trip the form was opened on; a caller that passes none gets the viewed trip, read now and never later.
    const context = tripContextRef.current;
    const target = trip ?? (context.role === "traveler" ? context.viewingTrip : null);
    if (onComplete) {
      completionCallbacks.current[id] = onComplete;
    }
    const newSave: PendingSave = {
      id,
      ...(target ? { tripId: target.tripId, tripTitle: target.title } : {}),
      data,
      imageBlob: image?.file,
      imageType: image?.file.type,
      imageWidth: image?.width,
      imageHeight: image?.height,
      imageAlreadyCompressed: image?.alreadyCompressed,
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

  const retrySave = useCallback(async (id: string, trip?: TripTarget | null) => {
    const save = savesRef.current.find(s => s.id === id);
    if (!save || retryingIds.current.has(id)) return;
    retryingIds.current.add(id);
    // A trip the Traveler chose for a save that has none (and no Story yet) is stamped; a save's own trip never changes.
    const chosen = trip && !save.tripId && !save.checkpointId ? { tripId: trip.tripId, tripTitle: trip.title } : {};
    const saveToRetry = { ...save, ...chosen, nextRetryAt: undefined };
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

  const dismissNotice = useCallback((id: string) => {
    setNoticeState(prev => ({ ...prev, notices: prev.notices.filter(n => n.id !== id) }));
  }, []);

  const value = {
    saves,
    startSave,
    retrySave,
    dismissSave,
    notices,
    dismissNotice,
  };

  return (
    <BackgroundSaveContext.Provider value={value}>
      {children}
    </BackgroundSaveContext.Provider>
  );
}

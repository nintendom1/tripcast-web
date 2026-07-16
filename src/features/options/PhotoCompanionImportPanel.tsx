import React, { useState, useRef, useMemo } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import {
  UploadCloud,
  FileArchive,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Trash2,
  Info
} from "lucide-react";

import { tripcastApi, type OrphanPhotoItem } from "../../convex/tripcastApi";
import {
  inspectArchiveZip,
  validateArchiveZip,
  type InspectedCompanionZip,
} from "./photoCompanionArchive";
import { Button } from "../../components/ui/button";
import { ConfirmModal } from "../../components/ui/ConfirmModal";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useBackgroundSave } from "../../providers/BackgroundSaveProvider";

type ImportState =
  | { type: "idle" }
  | { type: "scanning"; progress: number }
  | { type: "oversized_warning"; totalBytes: number; file: File; inspection: InspectedCompanionZip }
  | { type: "resolving" }
  | { type: "matching_summary"; file: File; inspection: InspectedCompanionZip; resolutions: Map<string, string> }
  | { type: "importing"; currentStep: string; progressPercent: number }
  | {
      type: "completed";
      attachedCount: number;
      skippedCount: number;
      failedCount: number;
      skippedItems: Array<{ pinRef: string; path: string; status: string; message?: string }>;
      failedItems: Array<{ pinRef: string; path: string; status: string; message?: string }>;
    }
  | { type: "error"; message: string };

async function runWithLimit<T, R>(
  limit: number,
  items: T[],
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing = new Set<Promise<void>>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const index = i;
    const p = Promise.resolve().then(() => fn(item)).then((res) => {
      results[index] = res;
      executing.delete(p);
    });
    executing.add(p);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
  return results;
}

export default function PhotoCompanionImportPanel({ token }: { token: string }) {
  const log = useDebugLogger("PhotoCompanionImportPanel", "src/features/options/PhotoCompanionImportPanel.tsx");
  const music = useMusicSafe();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [importState, setImportState] = useState<ImportState>({ type: "idle" });

  const { saves } = useBackgroundSave();
  const hasActiveBackgroundSaves = useMemo(() => {
    return saves.some(s => s.status === "uploading" || s.status === "saving");
  }, [saves]);

  const convex = useConvex();
  const generateUploadUrls = useMutation(tripcastApi.photoCompanion.travelerGeneratePhotoImportUploadUrls);
  const attachPhotoBatch = useMutation(tripcastApi.photoCompanion.travelerAttachPhotoCompanionBatch);
  const pruneOrphans = useMutation(tripcastApi.photoCompanion.travelerPruneOrphanPhotos);

  // Orphan state
  const [orphanCursor, setOrphanCursor] = useState<string | null>(null);
  const [scannedOrphans, setScannedOrphans] = useState<OrphanPhotoItem[]>([]);
  const [totalOrphanBytes, setTotalOrphanBytes] = useState(0);
  const [orphanScanStatus, setOrphanScanStatus] = useState<"idle" | "scanning" | "scanned">("idle");
  const [pruningStatus, setPruningStatus] = useState<"idle" | "pruning" | "done">("idle");
  const [isConfirmPruneOpen, setIsConfirmPruneOpen] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);

  // Queries for Orphans
  const orphanResult = useQuery(
    tripcastApi.photoCompanion.travelerAuditOrphanPhotoPage,
    orphanScanStatus === "scanning" ? { token, paginationOpts: { numItems: 50, cursor: orphanCursor } } : "skip"
  );

  // Concurrently paginating orphans
  React.useEffect(() => {
    if (orphanScanStatus === "scanning" && orphanResult) {
      const { page, continueCursor, isDone } = orphanResult;
      setScannedOrphans(prev => [...prev, ...page]);
      const bytesInPage = page.reduce((sum, item) => sum + item.bytes, 0);
      setTotalOrphanBytes(prev => prev + bytesInPage);

      if (!isDone && continueCursor) {
        setOrphanCursor(continueCursor);
      } else {
        setOrphanScanStatus("scanned");
      }
    }
  }, [orphanResult, orphanScanStatus]);

  const handleStartOrphanScan = () => {
    log.logUi("action:scan-orphans:start");
    music.sfx("tap");
    setScannedOrphans([]);
    setTotalOrphanBytes(0);
    setOrphanCursor(null);
    setMaintenanceError(null);
    setOrphanScanStatus("scanning");
  };

  const handlePruneConfirm = async () => {
    log.logUi("action:prune-orphans:confirm");
    setPruningStatus("pruning");
    setMaintenanceError(null);
    music.sfx("tap");
    try {
      const imageIdsToPrune = scannedOrphans.map(o => o.imageId);

      // Batch in size of 50
      const batches: string[][] = [];
      for (let i = 0; i < imageIdsToPrune.length; i += 50) {
        batches.push(imageIdsToPrune.slice(i, i + 50));
      }

      let deletedCount = 0;
      for (const batch of batches) {
        const results = await pruneOrphans({ token, imageIds: batch });
        deletedCount += results.filter(r => r.status === "deleted").length;
      }

      log.logUi("action:prune-orphans:complete", { deletedCount });
      setPruningStatus("done");
      music.sfx("success");
      // Auto rescan after pruning
      handleStartOrphanScan();
    } catch (err) {
      log.error("prune-orphans:error", "error", { err });
      setMaintenanceError(err instanceof Error ? err.message : String(err));
      setPruningStatus("idle");
    }
  };

  // ZIP Drag & Drop
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => {
    setDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      void processSelectedFile(file);
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processSelectedFile(file);
    }
  };

  const processSelectedFile = async (file: File) => {
    log.logUi("action:select-zip", { name: file.name, size: file.size });
    music.sfx("tap");
    setImportState({ type: "scanning", progress: 0 });
    try {
      const inspection = await inspectArchiveZip(file);
      if (inspection.totalPhotoBytes > 250 * 1024 * 1024) {
        setImportState({
          type: "oversized_warning",
          totalBytes: inspection.totalPhotoBytes,
          file,
          inspection,
        });
        return;
      }
      await resolveInspectedArchive(file, inspection);
    } catch (err) {
      log.error("zip-validation:error", "error", { err });
      setImportState({
        type: "error",
        message: err instanceof Error ? err.message : String(err)
      });
      music.sfx("success"); // Plays fallback/negative tone
    }
  };

  const resolveInspectedArchive = async (file: File, inspection: InspectedCompanionZip) => {
    setImportState({ type: "resolving" });
    try {
      const pinRefs = inspection.manifest.photos.map((photo) => photo.pinRef);
      const resolutionsMap = new Map<string, string>();
      for (let index = 0; index < pinRefs.length; index += 100) {
        const batchResults = await convex.query(
          tripcastApi.photoCompanion.travelerResolvePhotoCompanionRefs,
          { token, refs: pinRefs.slice(index, index + 100) },
        );
        for (const result of batchResults) resolutionsMap.set(result.pinRef, result.status);
      }
      const readyCount = inspection.manifest.photos.filter(
        (photo) => resolutionsMap.get(photo.pinRef) === "ready",
      ).length;
      if (readyCount > 500) {
        throw new Error(
          `This ZIP has ${readyCount} attachable photos. Photo Companion imports support at most 500 attachable photos at a time.`,
        );
      }
      setImportState({ type: "matching_summary", file, inspection, resolutions: resolutionsMap });
      music.sfx("page");
    } catch (err) {
      log.error("zip-resolution:error", "error", { err });
      setImportState({ type: "error", message: err instanceof Error ? err.message : String(err) });
      music.sfx("success");
    }
  };

  const handleStartImport = async (
    file: File,
    inspection: InspectedCompanionZip,
    resolutions: Map<string, string>,
  ) => {
    log.logUi("action:start-import", { totalPhotos: inspection.manifest.photos.length });
    music.sfx("tap");

    const photosToUpload = inspection.manifest.photos.filter(
      (photo) => resolutions.get(photo.pinRef) === "ready",
    );
    const totalToUpload = photosToUpload.length;

    let attachedCount = 0;
    const skippedCount = inspection.manifest.photos.length - totalToUpload;
    let failedCount = 0;

    const skippedItems: Array<{ pinRef: string; path: string; status: string; message?: string }> = [];
    const failedItems: Array<{ pinRef: string; path: string; status: string; message?: string }> = [];

    for (const photo of inspection.manifest.photos) {
      const status = resolutions.get(photo.pinRef);
      if (status && status !== "ready") {
        skippedItems.push({
          pinRef: photo.pinRef,
          path: photo.path,
          status,
          message: status === "already_has_photo"
            ? "TripCast protects the current photo. Open the pin, remove its photo, then import this ZIP again."
            : undefined
        });
      }
    }

    if (totalToUpload === 0) {
      setImportState({
        type: "completed",
        attachedCount,
        skippedCount,
        failedCount,
        skippedItems,
        failedItems
      });
      return;
    }

    setImportState({
      type: "importing",
      currentStep: `Extracting and verifying ${totalToUpload} photos...`,
      progressPercent: 0
    });

    try {
      const selectedPinRefs = new Set(photosToUpload.map((photo) => photo.pinRef));
      const zip = await validateArchiveZip(file, selectedPinRefs);
      const importablePhotos = photosToUpload.filter((photo) => {
        const integrityError = zip.photoErrors.get(photo.pinRef);
        if (!integrityError) return true;
        failedItems.push({
          pinRef: photo.pinRef,
          path: photo.path,
          status: "integrity_failed",
          message: integrityError,
        });
        failedCount++;
        return false;
      });

      for (let start = 0; start < importablePhotos.length; start += 10) {
        const wave = importablePhotos.slice(start, start + 10);
        setImportState({
          type: "importing",
          currentStep: `Preparing photos ${start + 1}-${start + wave.length} of ${totalToUpload}...`,
          progressPercent: Math.round((start / totalToUpload) * 100),
        });

        let uploadUrls: string[];
        try {
          uploadUrls = await generateUploadUrls({ token, count: wave.length });
        } catch (err) {
          for (const photo of importablePhotos.slice(start)) {
            failedItems.push({
              pinRef: photo.pinRef,
              path: photo.path,
              status: "interrupted",
              message: `Import stopped before upload: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
          failedCount += importablePhotos.length - start;
          break;
        }

        const uploadedFileMap = new Map<string, string>();
        await runWithLimit(4, wave, async (photo) => {
          const blob = zip.photoBlobs.get(photo.pinRef)!.blob;
          const uploadUrl = uploadUrls[wave.indexOf(photo)];
          try {
            const response = await fetch(uploadUrl, {
              method: "POST",
              headers: { "Content-Type": photo.contentType },
              body: blob,
            });
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            const result = await response.json() as { storageId?: string };
            if (!result.storageId) throw new Error("No storageId returned from upload.");
            uploadedFileMap.set(photo.pinRef, result.storageId);
          } catch (err) {
            log.error("upload-photo:error", "error", { err });
            failedItems.push({
              pinRef: photo.pinRef,
              path: photo.path,
              status: "upload_failed",
              message: err instanceof Error ? err.message : String(err),
            });
            failedCount++;
          }
        });

        const uploadedPhotos = wave.filter((photo) => uploadedFileMap.has(photo.pinRef));
        const cleanUpStorageIds: string[] = [];
        try {
          const results = uploadedPhotos.length === 0
            ? []
            : await attachPhotoBatch({
                token,
                attachments: uploadedPhotos.map((photo) => ({
                  ref: photo.pinRef,
                  imageId: uploadedFileMap.get(photo.pinRef)!,
                  sha256: photo.sha256,
                  bytes: photo.bytes,
                  contentType: photo.contentType,
                  imageWidth: photo.imageWidth ?? undefined,
                  imageHeight: photo.imageHeight ?? undefined,
                  imageSize: photo.imageSize ?? undefined,
                })),
              });
          for (const res of results) {
            if (res.status === "attached") {
              attachedCount++;
            } else {
              cleanUpStorageIds.push(res.imageId);
              failedItems.push({
                pinRef: res.pinRef,
                path: zip.photoBlobs.get(res.pinRef)!.entry.path,
                status: res.status,
                message: res.message
              });
              failedCount++;
            }
          }
        } catch (err) {
          log.error("attach-batch:error", "error", { err });
          for (const photo of uploadedPhotos) {
            cleanUpStorageIds.push(uploadedFileMap.get(photo.pinRef)!);
            failedItems.push({
              pinRef: photo.pinRef,
              path: photo.path,
              status: "batch_failed",
              message: err instanceof Error ? err.message : String(err)
            });
            failedCount++;
          }
        }

        for (let cleanupStart = 0; cleanupStart < cleanUpStorageIds.length; cleanupStart += 50) {
          const cleanupBatch = cleanUpStorageIds.slice(cleanupStart, cleanupStart + 50);
          try {
            const cleanupResults = await pruneOrphans({ token, imageIds: cleanupBatch });
            for (const result of cleanupResults) {
              if (result.status === "deleted" || result.status === "missing") continue;
              failedItems.push({
                pinRef: `storage:${result.imageId}`,
                path: result.imageId,
                status: `cleanup_${result.status}`,
                message: "The upload could not be removed automatically. Run orphan cleanup after active uploads finish.",
              });
            }
          } catch (cleanupErr) {
            log.error("cleanup-unattached:error", "error", { cleanupErr });
            failedItems.push({
              pinRef: "storage:cleanup",
              path: `${cleanupBatch.length} uploaded file(s)`,
              status: "cleanup_failed",
              message: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
            });
          }
        }

        setImportState({
          type: "importing",
          currentStep: `Importing photos (${Math.min(start + wave.length, totalToUpload)}/${totalToUpload})...`,
          progressPercent: Math.round((Math.min(start + wave.length, totalToUpload) / totalToUpload) * 100),
        });
      }

      setImportState({
        type: "completed",
        attachedCount,
        skippedCount,
        failedCount,
        skippedItems,
        failedItems
      });
      music.sfx("success");
    } catch (err) {
      log.error("import-process:fatal-error", "error", { err });
      setImportState({
        type: "error",
        message: `Fatal error during import: ${err instanceof Error ? err.message : String(err)}`
      });
      music.sfx("success");
    }
  };

  const handleResetImport = () => {
    setImportState({ type: "idle" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="grid gap-6">
      {/* 1. IDLE STATE: DROPZONE */}
      {importState.type === "idle" && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-[var(--flag)] bg-[var(--meter-track)]"
              : "border-[var(--line-soft)] hover:border-[var(--flag)]"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileSelect}
            accept=".zip"
            className="hidden"
            aria-label="Upload Photo Companion ZIP"
          />
          <UploadCloud className="h-12 w-12 text-[var(--ink-3)] mb-4" />
          <p className="font-semibold text-base text-[var(--ink-1)]">Select or drag Photo ZIP</p>
          <p className="text-xs text-[var(--ink-3)] mt-2 max-w-xs">
            Import a TripCast photo companion ZIP. We will inspect, validate, and securely attach photos back to your pins.
          </p>
        </div>
      )}

      {/* 2. SCANNING / LOADING STATE */}
      {importState.type === "scanning" && (
        <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)]">
          <Loader2 className="h-10 w-10 animate-spin text-[var(--flag)] mb-4" />
          <p className="font-semibold text-sm text-[var(--ink-1)]">Inspecting ZIP archive...</p>
          <p className="text-xs text-[var(--ink-3)] mt-2">Checking paths, manifest data, and declared sizes.</p>
        </div>
      )}

      {/* 3. OVERSIZED WARNING */}
      {importState.type === "oversized_warning" && (
        <div className="p-5 rounded-2xl border border-[var(--ink-danger)] bg-[var(--bg-danger)]/20 text-center">
          <AlertTriangle className="h-10 w-10 text-[var(--ink-danger)] mx-auto mb-3" />
          <p className="font-bold text-sm text-[var(--ink-1)]">ZIP archive is very large</p>
          <p className="text-xs text-[var(--ink-2)] mt-2">
            The selected ZIP contains {(importState.totalBytes / (1024 * 1024)).toFixed(1)} MiB of uncompressed photo data.
            ZIP extraction is memory-intensive on mobile devices.
            We recommend a desktop browser or narrowing the export date range first.
          </p>
          <div className="mt-4 flex gap-2 justify-center">
            <Button variant="outline" onClick={handleResetImport}>
              Cancel
            </Button>
            <Button
              className="bg-[var(--flag)] text-white"
              onClick={() => resolveInspectedArchive(importState.file, importState.inspection)}
            >
              Continue Anyway
            </Button>
          </div>
        </div>
      )}

      {/* 4. RESOLVING STATUS */}
      {importState.type === "resolving" && (
        <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)]">
          <Loader2 className="h-10 w-10 animate-spin text-[var(--flag)] mb-4" />
          <p className="font-semibold text-sm text-[var(--ink-1)]">Matching archive with TripCast pins...</p>
          <p className="text-xs text-[var(--ink-3)] mt-2">Identifying matching pinRefs and protecting existing photos.</p>
        </div>
      )}

      {/* 5. MATCHING SUMMARY / CONFLICTS */}
      {importState.type === "matching_summary" && (
        <div className="p-4 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)]">
          <div className="flex items-center gap-2 mb-4">
            <FileArchive className="h-6 w-6 text-[var(--flag)]" />
            <h4 className="font-bold text-base text-[var(--ink-1)]">ZIP Verification Complete</h4>
          </div>

          <p className="text-xs text-[var(--ink-2)] mb-4">
            Successfully scanned <strong>{importState.inspection.manifest.photos.length}</strong> photo entries from manifest.json.
          </p>

          {/* Resolutions metrics */}
          {(() => {
            const photos = importState.inspection.manifest.photos;
            const ready = photos.filter(p => importState.resolutions.get(p.pinRef) === "ready");
            const conflict = photos.filter(p => importState.resolutions.get(p.pinRef) === "already_has_photo");
            const unmatched = photos.filter(p => importState.resolutions.get(p.pinRef) === "unmatched");
            const ambiguous = photos.filter(p => importState.resolutions.get(p.pinRef) === "ambiguous");

            return (
              <div className="grid gap-3 mb-6">
                <div className="flex justify-between items-center text-sm border-b border-[var(--line-soft)] pb-2">
                  <span className="text-[var(--ink-2)]">Ready to import (new):</span>
                  <span className="font-bold text-[var(--green)]">{ready.length}</span>
                </div>
                {conflict.length > 0 && (
                  <div className="flex justify-between items-center text-sm border-b border-[var(--line-soft)] pb-2 bg-amber-500/10 px-2 py-1 rounded">
                    <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" /> Protected (exists on pin):
                    </span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">{conflict.length}</span>
                  </div>
                )}
                {unmatched.length > 0 && (
                  <div className="flex justify-between items-center text-sm border-b border-[var(--line-soft)] pb-2">
                    <span className="text-[var(--ink-3)]">No matching pins found:</span>
                    <span className="font-semibold text-[var(--ink-2)]">{unmatched.length}</span>
                  </div>
                )}
                {ambiguous.length > 0 && (
                  <div className="flex justify-between items-center text-sm border-b border-[var(--line-soft)] pb-2">
                    <span className="text-[var(--ink-3)]">Ambiguous sourceImportRef matches:</span>
                    <span className="font-semibold text-[var(--ink-2)]">{ambiguous.length}</span>
                  </div>
                )}

                {conflict.length > 0 && (
                  <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-400 italic">
                    Note: TripCast protects currently attached photos. To replace them, delete the current photo on the pin manually and rerun the ZIP import.
                  </p>
                )}
              </div>
            );
          })()}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleResetImport}>
              Discard ZIP
            </Button>
            <Button
              className="flex-1 bg-[var(--flag)] text-white"
              onClick={() => handleStartImport(importState.file, importState.inspection, importState.resolutions)}
            >
              Start Import
            </Button>
          </div>
        </div>
      )}

      {/* 6. IMPORTING / UPLOADING AND ATTACHING */}
      {importState.type === "importing" && (
        <div className="p-6 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)]">
          <div className="flex items-center gap-3 mb-4">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--flag)]" />
            <span className="font-semibold text-sm text-[var(--ink-1)]">{importState.currentStep}</span>
          </div>
          <div className="w-full bg-[var(--meter-track)] rounded-full h-3">
            <div
              className="bg-[var(--flag)] h-3 rounded-full transition-all duration-300"
              style={{ width: `${importState.progressPercent}%` }}
            />
          </div>
          <p className="text-[11px] text-[var(--ink-3)] text-right mt-1.5">{importState.progressPercent}%</p>
        </div>
      )}

      {/* 7. COMPLETED SUMMARY */}
      {importState.type === "completed" && (
        <div className="p-5 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)]">
          <div className="flex items-center gap-2 mb-4 text-[var(--green)]">
            <CheckCircle className="h-6 w-6" />
            <h4 className="font-bold text-base text-[var(--ink-1)]">Import Finished</h4>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center mb-6">
            <div className="p-3 bg-[var(--bg-paper-2)]/40 rounded-xl border border-[var(--line-soft)]">
              <p className="text-xl font-bold text-[var(--green)]">{importState.attachedCount}</p>
              <p className="text-[10px] text-[var(--ink-3)] uppercase font-mono tracking-wider">Attached</p>
            </div>
            <div className="p-3 bg-[var(--bg-paper-2)]/40 rounded-xl border border-[var(--line-soft)]">
              <p className="text-xl font-bold text-[var(--ink-2)]">{importState.skippedCount}</p>
              <p className="text-[10px] text-[var(--ink-3)] uppercase font-mono tracking-wider">Skipped</p>
            </div>
            <div className="p-3 bg-[var(--bg-paper-2)]/40 rounded-xl border border-[var(--line-soft)]">
              <p className="text-xl font-bold text-[var(--ink-danger)]">{importState.failedCount}</p>
              <p className="text-[10px] text-[var(--ink-3)] uppercase font-mono tracking-wider">Failed</p>
            </div>
          </div>

          {/* Skipped Details */}
          {importState.skippedItems.length > 0 && (
            <div className="mb-4">
              <p className="font-semibold text-xs text-[var(--ink-2)] mb-1">Skipped Items details:</p>
              <div className="max-h-32 overflow-y-auto rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] p-2 text-xs">
                {importState.skippedItems.map((item, idx) => (
                  <div key={idx} className="py-1 border-b border-[var(--line-soft)] last:border-b-0">
                    <span className="font-bold font-mono text-[10px] text-[var(--ink-3)] mr-1">[{item.status}]</span>
                    <span className="text-[var(--ink-2)]">{item.path}</span>
                    {item.message && <p className="text-[10px] text-amber-500 italic mt-0.5">{item.message}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failed Details */}
          {importState.failedItems.length > 0 && (
            <div className="mb-4">
              <p className="font-semibold text-xs text-[var(--ink-danger)] mb-1">Failed Items details:</p>
              <div className="max-h-32 overflow-y-auto rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] p-2 text-xs">
                {importState.failedItems.map((item, idx) => (
                  <div key={idx} className="py-1 border-b border-[var(--line-soft)] last:border-b-0">
                    <span className="font-bold font-mono text-[10px] text-rose-500 mr-1">[{item.status}]</span>
                    <span className="text-[var(--ink-2)]">{item.path}</span>
                    {item.message && <p className="text-[10px] text-rose-500 italic mt-0.5">{item.message}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button className="w-full bg-[var(--flag)] text-white" onClick={handleResetImport}>
            Back to ZIP Upload
          </Button>
        </div>
      )}

      {/* 8. ERROR STATE */}
      {importState.type === "error" && (
        <div className="p-5 rounded-2xl border border-[var(--ink-danger)] bg-[var(--bg-danger)]/20 text-center">
          <XCircle className="h-10 w-10 text-[var(--ink-danger)] mx-auto mb-3" />
          <p className="font-bold text-sm text-[var(--ink-1)]">Import Failed</p>
          <p className="text-xs text-[var(--ink-2)] mt-2 leading-relaxed">
            {importState.message}
          </p>
          <Button className="mt-4 bg-[var(--flag)] text-white" onClick={handleResetImport}>
            Try Another ZIP
          </Button>
        </div>
      )}

      {/* 9. ORPHAN PHOTO MAINTENANCE SECTION */}
      <div className="border-t border-[var(--line-soft)] pt-6 mt-2">
        <h4 className="font-bold text-base text-[var(--ink-1)] mb-2">Orphaned Photos Cleanup</h4>
        <p className="text-xs text-[var(--ink-3)] leading-relaxed mb-4">
          Orphaned photos are uploaded image files in storage that are not connected to any Story checkpoint.
          Scanning allows you to free up unused cloud storage.
        </p>

        {maintenanceError && (
          <p className="mb-4 rounded-lg border border-[var(--ink-danger)] bg-[var(--bg-danger)]/20 p-3 text-xs text-[var(--ink-danger)]">
            Orphan cleanup failed: {maintenanceError}
          </p>
        )}

        {orphanScanStatus === "idle" && (
          <Button variant="outline" className="w-full" onClick={handleStartOrphanScan}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Scan orphaned photos
          </Button>
        )}

        {orphanScanStatus === "scanning" && (
          <div className="flex items-center justify-center p-4 gap-2 text-sm text-[var(--ink-3)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--flag)]" />
            <span>Scanning storage...</span>
          </div>
        )}

        {orphanScanStatus === "scanned" && (
          <div className="p-4 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-paper-2)]/30">
            <div className="flex justify-between items-center text-sm mb-4">
              <span className="text-[var(--ink-2)]">Orphans found:</span>
              <span className="font-bold text-[var(--ink-1)]">
                {scannedOrphans.length} ({(totalOrphanBytes / (1024 * 1024)).toFixed(2)} MB)
              </span>
            </div>

            {scannedOrphans.length > 0 ? (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleStartOrphanScan}>
                  Rescan
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={hasActiveBackgroundSaves || pruningStatus === "pruning"}
                  onClick={() => setIsConfirmPruneOpen(true)}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  {pruningStatus === "pruning" ? "Pruning..." : "Prune Storage"}
                </Button>
              </div>
            ) : (
              <div className="text-center text-xs text-green-600 dark:text-green-400 font-medium">
                No orphaned photos found in cloud storage!
              </div>
            )}

            {hasActiveBackgroundSaves && scannedOrphans.length > 0 && (
              <p className="text-[10px] text-amber-500 italic text-center mt-2">
                Note: Pruning is disabled while there are active or pending background uploads.
              </p>
            )}
          </div>
        )}
      </div>

      {/* 10. CONFIRM PRUNE MODAL */}
      <ConfirmModal
        open={isConfirmPruneOpen}
        onOpenChange={setIsConfirmPruneOpen}
        title="Prune Unreferenced Photos?"
        description={
          <div className="space-y-2">
            <p>
              Are you sure you want to permanently delete <strong>{scannedOrphans.length} unreferenced photos</strong>?
            </p>
            <p className="text-rose-500 font-semibold flex items-center gap-1 text-xs">
              <Info className="h-3.5 w-3.5 shrink-0" />
              There is no grace period. Please ensure no other devices or tabs are currently uploading photos before continuing.
            </p>
          </div>
        }
        confirmLabel={pruningStatus === "pruning" ? "Pruning..." : "Delete Permanently"}
        cancelLabel="Keep Files"
        onConfirm={handlePruneConfirm}
        variant="danger"
      />
    </div>
  );
}

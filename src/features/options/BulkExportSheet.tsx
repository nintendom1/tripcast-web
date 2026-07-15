import { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, Download, Loader2, FileArchive } from "lucide-react";
import { useQuery, useConvex } from "convex/react";
import { ZipWriter, BlobWriter, BlobReader } from "@zip.js/zip.js";

import { tripcastApi, type PhotoCompanionPage, type PhotoCompanionPageItem } from "../../convex/tripcastApi";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetTitle,
} from "../../components/ui/sheet";
import { Button } from "../../components/ui/button";
import { FeatureBoundary } from "../../components/resilience/FeatureBoundary";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useTheme } from "../../providers/ThemeProvider";
import { cn } from "@/lib/utils";
import { ConfirmModal } from "../../components/ui/ConfirmModal";
import { PHOTO_MIME_EXTENSIONS } from "./photoCompanionArchive";

// Convex caps query return arrays at 8192 elements. The export folds every
// table (checkpoints, missions, votes, transactions, breadcrumbs) into one
// array, so we keep the projected total under a margin below that hard limit
// and trim breadcrumbs to fit. See tripcast-backend bulkImport.travelerExportTripData.
const SAFE_CAP = 8000;

type BulkExportSheetProps = {
  open: boolean;
  token: string;
  onOpenChange: (open: boolean) => void;
};

type BulkExportResult = {
  timeZone?: string;
  entries: unknown[];
};

function isBulkExportResult(value: unknown): value is BulkExportResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "entries" in value &&
    Array.isArray((value as { entries?: unknown }).entries)
  );
}

type TickerExportResult = {
  entries: { kind: "ticker_fact" | "ticker_tip"; ref: string; text: string }[];
};

function isTickerExportResult(value: unknown): value is TickerExportResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "entries" in value &&
    Array.isArray((value as { entries?: unknown }).entries)
  );
}

type ExportCounts = { otherCount: number; breadcrumbCount: number };

function isExportCounts(value: unknown): value is ExportCounts {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { otherCount?: unknown }).otherCount === "number" &&
    typeof (value as { breadcrumbCount?: unknown }).breadcrumbCount === "number"
  );
}

async function runWithLimit<T, R>(
  limit: number,
  items: T[],
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing = new Set<Promise<any>>();
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

function getExtensionForMime(mime: string | null): string {
  if (!mime) return ".jpg";
  const norm = mime.trim().toLowerCase();
  if (norm in PHOTO_MIME_EXTENSIONS) {
    return PHOTO_MIME_EXTENSIONS[norm as keyof typeof PHOTO_MIME_EXTENSIONS][0];
  }
  return ".jpg";
}

export default function BulkExportSheet({
  open,
  token,
  onOpenChange,
}: BulkExportSheetProps) {
  const log = useDebugLogger("BulkExportSheet", "src/features/options/BulkExportSheet.tsx");

  useEffect(() => {
    log.logUi(open ? "sheet:open" : "sheet:close");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useActiveUiContext(open, {
    sheetName: "BulkExportSheet",
    label: "Bulk Export",
    source: "options:bulk-export",
    sourceLabel: "Options -> Bulk Export",
    file: "src/features/options/BulkExportSheet.tsx",
  }, { boundsSelector: "[data-role='bulk-export-sheet']" });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-role="bulk-export-sheet"
        className="max-h-[88dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
      >
        <div className="flex items-start justify-between gap-2 px-5 pt-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <SheetTitle className="font-[var(--font-display)] text-2xl font-extrabold tracking-tight text-[var(--ink-1)]">
              Bulk Export
            </SheetTitle>
          </div>
          <SheetCloseButton aria-label="Close bulk export" />
        </div>

        {/* The query-driven body lives in a child so this boundary is a true
            ancestor of its useQuery hooks — a useQuery throw renders in the
            component that calls it, so it can only be caught from above. This
            keeps an oversized export from reaching the app-level crash screen. */}
        <FeatureBoundary
          title="Export hit a snag."
          message="The export couldn't be prepared. Try again, or close and reopen Bulk Export."
          onClose={() => onOpenChange(false)}
          resetKeys={[open]}
        >
          <BulkExportBody open={open} token={token} />
        </FeatureBoundary>
      </SheetContent>
    </Sheet>
  );
}

type PhotoZipState =
  | { type: "idle" }
  | { type: "scanning"; count: number; bytes: number }
  | { type: "warning"; count: number; bytes: number }
  | { type: "downloading"; progress: string; percent: number }
  | { type: "archiving"; percent: number }
  | { type: "complete"; fileCount: number; missingCount: number }
  | { type: "error"; message: string };

function BulkExportBody({ open, token }: { open: boolean; token: string }) {
  const [range, setRange] = useState<"all" | "custom">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [includeMysteryMissions, setIncludeMysteryMissions] = useState(false);
  const [includeLiveTrail, setIncludeLiveTrail] = useState(false);
  const [confirmRecent, setConfirmRecent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tickerCopied, setTickerCopied] = useState(false);
  const music = useMusicSafe();
  const { resolvedTheme } = useTheme();
  const log = useDebugLogger("BulkExportSheet", "src/features/options/BulkExportSheet.tsx");
  const dateInputStyle = { colorScheme: resolvedTheme === "constellation" ? "dark" : "light" } as const;

  const startMs = startDate ? new Date(startDate).getTime() : undefined;
  const endMs = endDate ? new Date(endDate).getTime() + 86399999 : undefined;

  // Photo ZIP State
  const convex = useConvex();
  const [photoZipState, setPhotoZipState] = useState<PhotoZipState>({ type: "idle" });
  const [isConfirmZipWarningOpen, setIsConfirmZipWarningOpen] = useState(false);

  // Any change to what would be exported invalidates a prior "most recent"
  // confirmation so we never run a bounded export against stale inputs.
  useEffect(() => {
    setConfirmRecent(false);
  }, [startMs, endMs, includeMysteryMissions, includeLiveTrail]);

  // Reset Photo ZIP state when range or date changes
  useEffect(() => {
    setPhotoZipState({ type: "idle" });
  }, [startMs, endMs]);

  // Preflight count only runs once breadcrumbs are requested (the default-off
  // toggle), since breadcrumbs are the only realistic way to blow the cap.
  const countResult = useQuery(
    tripcastApi.bulkImport.travelerCountExportEntries,
    open && includeLiveTrail ? { token, startMs, endMs, includeMysteryMissions } : "skip",
  );
  const counts = isExportCounts(countResult) ? countResult : undefined;
  const totalIfAll = counts ? counts.otherCount + counts.breadcrumbCount : undefined;
  const overCap = totalIfAll !== undefined && totalIfAll > SAFE_CAP;
  const recentN = counts ? Math.max(0, SAFE_CAP - counts.otherCount) : 0;
  const countLoading = open && includeLiveTrail && counts === undefined;
  const blocked = overCap && !confirmRecent;
  const usedRecentLimit = includeLiveTrail && overCap && confirmRecent;

  const exportArgs:
    | {
        token: string;
        startMs?: number;
        endMs?: number;
        includeMysteryMissions: boolean;
        includeLiveTrail: boolean;
        liveTrailLimit?: number;
      }
    | "skip" = (() => {
    if (!open) return "skip";
    if (!includeLiveTrail) {
      return { token, startMs, endMs, includeMysteryMissions, includeLiveTrail: false };
    }
    if (counts === undefined) return "skip";
    if (!overCap) {
      return { token, startMs, endMs, includeMysteryMissions, includeLiveTrail: true };
    }
    if (confirmRecent) {
      return {
        token,
        startMs,
        endMs,
        includeMysteryMissions,
        includeLiveTrail: true,
        liveTrailLimit: recentN,
      };
    }
    return "skip";
  })();

  const queryResult = useQuery(tripcastApi.bulkImport.travelerExportTripData, exportArgs);
  const data = isBulkExportResult(queryResult) ? queryResult : undefined;

  const tickerQueryResult = useQuery(
    tripcastApi.bulkImport.travelerExportTickerMessages,
    open ? { token } : "skip"
  );
  const tickerData = isTickerExportResult(tickerQueryResult) ? tickerQueryResult : undefined;

  async function handleCopy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      music.sfx("success");
      setTimeout(() => setCopied(false), 2000);
      log.logUi("action:copy-export");
    } catch (err) {
      log.error("copy:error", "error", { err });
    }
  }

  function handleDownload() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const timestamp = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `tripcast-export-${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    music.sfx("page");
    log.logUi("action:download-export");
  }

  async function handleCopyTicker() {
    if (!tickerData) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(tickerData, null, 2));
      setTickerCopied(true);
      music.sfx("success");
      setTimeout(() => setTickerCopied(false), 2000);
      log.logUi("action:copy-ticker-export");
    } catch (err) {
      log.error("copy-ticker:error", "error", { err });
    }
  }

  function handleDownloadTicker() {
    if (!tickerData) return;
    const blob = new Blob([JSON.stringify(tickerData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const timestamp = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `tripcast-ticker-${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    music.sfx("page");
    log.logUi("action:download-ticker-export");
  }

  // --- Photo Companion ZIP Export Logic ---

  async function handleScanPhotoZip() {
    log.logUi("action:scan-photo-zip:start");
    music.sfx("tap");
    setPhotoZipState({ type: "scanning", count: 0, bytes: 0 });

    try {
      let currentCursor: string | null = null;
      let totalPhotosCount = 0;
      let totalBytesSize = 0;

      while (true) {
        const res: PhotoCompanionPage = await convex.query(tripcastApi.photoCompanion.travelerListPhotoCompanionPage, {
          token,
          paginationOpts: { numItems: 50, cursor: currentCursor },
          startMs,
          endMs,
        });

        // Sum size of non-missing photos
        const pagePhotos: PhotoCompanionPageItem[] = res.page || [];
        totalPhotosCount += pagePhotos.length;
        totalBytesSize += pagePhotos.reduce((sum: number, item: PhotoCompanionPageItem) => sum + (item.bytes || 0), 0);

        setPhotoZipState({ type: "scanning", count: totalPhotosCount, bytes: totalBytesSize });

        if (res.isDone || !res.continueCursor) {
          break;
        }
        currentCursor = res.continueCursor;
      }

      log.logUi("action:scan-photo-zip:scanned", { totalPhotosCount, totalBytesSize });

      const warningLimitBytes = 250 * 1024 * 1024;
      if (totalBytesSize > warningLimitBytes) {
        setPhotoZipState({ type: "warning", count: totalPhotosCount, bytes: totalBytesSize });
        setIsConfirmZipWarningOpen(true);
      } else {
        await executePhotoZipDownload(totalPhotosCount, totalBytesSize);
      }
    } catch (err) {
      log.error("photo-zip-scan:error", "error", { err });
      setPhotoZipState({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to scan photo companion pages."
      });
    }
  }

  async function executePhotoZipDownload(totalCount: number, totalBytes: number) {
    log.logUi("action:download-photo-zip:execute");
    setPhotoZipState({ type: "downloading", progress: "Starting fetches...", percent: 0 });

    try {
      let currentCursor: string | null = null;
      const allItems: PhotoCompanionPageItem[] = [];

      // Re-fetch items to get fresh URLs if needed
      while (true) {
        const res: PhotoCompanionPage = await convex.query(tripcastApi.photoCompanion.travelerListPhotoCompanionPage, {
          token,
          paginationOpts: { numItems: 50, cursor: currentCursor },
          startMs,
          endMs,
        });
        allItems.push(...(res.page || []));
        if (res.isDone || !res.continueCursor) {
          break;
        }
        currentCursor = res.continueCursor;
      }

      const zipWriter = new ZipWriter(new BlobWriter("application/zip"));
      const finalPhotos: any[] = [];
      const finalMissing: any[] = [];

      let fetchedCount = 0;

      // Download images with bounded concurrency (4)
      await runWithLimit(4, allItems, async (item: PhotoCompanionPageItem) => {
        const ext = getExtensionForMime(item.contentType);
        const checkpointId = item.pinRef.split(":")[1] || item.imageId;
        const targetPath = `photos/${checkpointId}${ext}`;

        // Validate MIME support
        const normalizedMime = item.contentType?.trim().toLowerCase() || "";
        const isMimeSupported = normalizedMime in PHOTO_MIME_EXTENSIONS;

        if (!isMimeSupported) {
          finalMissing.push({
            pinRef: item.pinRef,
            reason: "unsupported_content_type",
            contentType: item.contentType
          });
          fetchedCount++;
          setPhotoZipState({
            type: "downloading",
            progress: `Processing (${fetchedCount}/${allItems.length})...`,
            percent: Math.round((fetchedCount / allItems.length) * 100)
          });
          return;
        }

        if (!item.url) {
          finalMissing.push({
            pinRef: item.pinRef,
            reason: item.missingReason || "url_unavailable",
            contentType: item.contentType
          });
          fetchedCount++;
          setPhotoZipState({
            type: "downloading",
            progress: `Processing (${fetchedCount}/${allItems.length})...`,
            percent: Math.round((fetchedCount / allItems.length) * 100)
          });
          return;
        }

        try {
          const response = await fetch(item.url);
          if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
          }
          const blob = await response.blob();

          // Add to ZIP writer directly
          await zipWriter.add(targetPath, new BlobReader(blob));

          // Record valid metadata (never include the signed URL!)
          finalPhotos.push({
            pinRef: item.pinRef,
            path: targetPath,
            contentType: item.contentType,
            bytes: item.bytes || blob.size,
            sha256: item.sha256,
            imageWidth: item.imageWidth,
            imageHeight: item.imageHeight,
            imageSize: item.imageSize
          });
        } catch (fetchErr) {
          log.error("photo-zip-fetch:error", "error", { pinRef: item.pinRef, fetchErr });
          finalMissing.push({
            pinRef: item.pinRef,
            reason: "storage_missing",
            contentType: item.contentType
          });
        }

        fetchedCount++;
        setPhotoZipState({
          type: "downloading",
          progress: `Downloading photos (${fetchedCount}/${allItems.length})...`,
          percent: Math.round((fetchedCount / allItems.length) * 100)
        });
      });

      // Write manifest.json
      setPhotoZipState({ type: "archiving", percent: 90 });
      const manifest = {
        format: "tripcast-photo-companion",
        version: 1,
        exportedAt: new Date().toISOString(),
        selection: {
          startMs: startMs || null,
          endMs: endMs || null
        },
        photos: finalPhotos,
        missing: finalMissing
      };

      await zipWriter.add(
        "manifest.json",
        new BlobReader(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }))
      );

      // Finalize ZIP
      setPhotoZipState({ type: "archiving", percent: 98 });
      const finalZipBlob = await zipWriter.close();

      // Download ZIP trigger
      const url = URL.createObjectURL(finalZipBlob);
      const a = document.createElement("a");
      const timestamp = new Date().toISOString().split("T")[0];
      a.href = url;
      a.download = `tripcast-photos-${timestamp}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      setPhotoZipState({
        type: "complete",
        fileCount: finalPhotos.length,
        missingCount: finalMissing.length
      });
      music.sfx("success");
    } catch (err) {
      log.error("photo-zip-generation:error", "error", { err });
      setPhotoZipState({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to generate Photo Companion ZIP."
      });
    }
  }

  return (
    <SheetBody className="grid gap-6 px-5 py-4 text-[var(--ink-1)]">
      <div className="grid gap-4">
        <div className="flex rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-1 shadow-sm">
          <button
            type="button"
            onClick={() => {
              log.logUi("action:range:all");
              setRange("all");
            }}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-semibold transition-colors",
              range === "all"
                ? "bg-[var(--flag)] text-[var(--ink-on-brand)] shadow-sm"
                : "text-[var(--ink-2)] hover:bg-[var(--meter-track)]",
            )}
          >
            Export All
          </button>
          <button
            type="button"
            onClick={() => {
              log.logUi("action:range:custom");
              setRange("custom");
            }}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-semibold transition-colors",
              range === "custom"
                ? "bg-[var(--flag)] text-[var(--ink-on-brand)] shadow-sm"
                : "text-[var(--ink-2)] hover:bg-[var(--meter-track)]",
            )}
          >
            Custom Range
          </button>
        </div>

        {range === "custom" && (
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-3">
            <label className="grid gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-3)]">Start Date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] p-2 text-sm text-[var(--ink-1)] outline-none focus:border-[var(--flag)] focus:ring-1 focus:ring-[var(--flag)]"
                style={dateInputStyle}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-3)]">End Date</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] p-2 text-sm text-[var(--ink-1)] outline-none focus:border-[var(--flag)] focus:ring-1 focus:ring-[var(--flag)]"
                style={dateInputStyle}
              />
            </label>
          </div>
        )}

        <label className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 text-sm text-[var(--ink-1)]">
          <input
            type="checkbox"
            checked={includeMysteryMissions}
            onChange={(event) => {
              log.logUi("action:include-mystery", { enabled: event.currentTarget.checked });
              setIncludeMysteryMissions(event.currentTarget.checked);
            }}
            className="mt-1 h-4 w-4"
            style={{ accentColor: "var(--ink-1)" }}
          />
          <span className="grid gap-1">
            <span className="font-medium">Include Mystery Missions</span>
            <span className="text-[var(--ink-2)]">
              Adds full Mystery Mission definitions, including true intent and spoiler metadata.
            </span>
          </span>
        </label>

        <label className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 text-sm text-[var(--ink-1)]">
          <input
            type="checkbox"
            checked={includeLiveTrail}
            onChange={(event) => {
              log.logUi("action:include-live-trail", { enabled: event.currentTarget.checked });
              setIncludeLiveTrail(event.currentTarget.checked);
            }}
            className="mt-1 h-4 w-4"
            style={{ accentColor: "var(--ink-1)" }}
          />
          <span className="grid gap-1">
            <span className="font-medium">Include Live Trail breadcrumbs</span>
            <span className="text-[var(--ink-2)]">
              Adds sampled breadcrumb coordinates for dev fixtures and replay data round-trips.
            </span>
          </span>
        </label>
      </div>

      {/* JSON DATA EXPORT CARD */}
      <div className="grid gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-4 text-center shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-3)]">JSON Data</p>
        {countLoading ? (
          <div className="flex items-center justify-center gap-2 py-4 text-[var(--ink-3)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Checking breadcrumb count...</span>
          </div>
        ) : blocked ? (
          <div className="grid gap-3 py-2">
            <div className="flex items-center justify-center gap-2 text-[var(--ink-danger)]">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-sm font-semibold">
                {(counts?.breadcrumbCount ?? 0).toLocaleString()} breadcrumbs recorded
              </span>
            </div>
            <p className="text-xs text-[var(--ink-2)]">
              That's over the {SAFE_CAP.toLocaleString()}-entry safe limit for a single export.
            </p>
            {recentN > 0 ? (
              <Button
                type="button"
                onClick={() => {
                  log.logUi("action:export-recent-breadcrumbs", { recentN });
                  setConfirmRecent(true);
                }}
                className="border-0 bg-[var(--flag)] text-[var(--ink-on-brand)] hover:bg-[var(--flag)] hover:opacity-90"
              >
                Export most recent {recentN.toLocaleString()}
              </Button>
            ) : (
              <p className="text-xs text-[var(--ink-3)]">
                Other trip data already fills the export. Narrow the date range to make room for breadcrumbs.
              </p>
            )}
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center gap-2 py-4 text-[var(--ink-3)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Preparing export...</span>
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-[var(--ink-1)]">
              {data.entries.length} items ready for export
            </p>
            {usedRecentLimit ? (
              <p className="text-xs text-[var(--ink-2)]">
                Most recent {recentN.toLocaleString()} of {(counts?.breadcrumbCount ?? 0).toLocaleString()} breadcrumbs.
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleCopy}
                variant="outline"
                className="flex-1 border-[var(--line-soft)] bg-[var(--bg-paper)] text-[var(--ink-1)] hover:bg-[var(--meter-track)] hover:text-[var(--ink-1)]"
              >
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? "Copied" : "Copy JSON"}
              </Button>
              <Button
                type="button"
                onClick={handleDownload}
                className="flex-1 border-0 bg-[var(--flag)] text-[var(--ink-on-brand)] hover:bg-[var(--flag)] hover:opacity-90"
              >
                <Download className="mr-2 h-4 w-4" />
                Download .json
              </Button>
            </div>
          </>
        )}
      </div>

      {/* PHOTO COMPANION ZIP EXPORT CARD */}
      <div className="grid gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-4 text-center shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-3)]">Photo Companion ZIP</p>

        {photoZipState.type === "idle" && (
          <Button
            type="button"
            onClick={handleScanPhotoZip}
            className="w-full border-0 bg-[var(--flag)] text-[var(--ink-on-brand)] hover:bg-[var(--flag)] hover:opacity-90"
          >
            <FileArchive className="mr-2 h-4 w-4" />
            Prepare Photo ZIP
          </Button>
        )}

        {photoZipState.type === "scanning" && (
          <div className="flex flex-col items-center justify-center py-2 gap-2 text-sm text-[var(--ink-3)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Scanning companion pages... ({photoZipState.count} photos found, {(photoZipState.bytes / (1024 * 1024)).toFixed(1)} MB)</span>
          </div>
        )}

        {(photoZipState.type === "warning" || photoZipState.type === "complete" || photoZipState.type === "error") && (
          <div className="grid gap-3">
            {photoZipState.type === "warning" && (
              <div className="text-amber-500 text-xs font-semibold flex items-center justify-center gap-1.5 bg-amber-500/10 p-2 rounded-lg">
                <AlertTriangle className="h-4 w-4" />
                <span>Oversized: {photoZipState.count} photos ({(photoZipState.bytes / (1024 * 1024)).toFixed(1)} MiB)</span>
              </div>
            )}

            {photoZipState.type === "complete" && (
              <div className="text-green-600 dark:text-green-400 text-sm font-semibold flex flex-col items-center justify-center gap-1 bg-green-500/10 p-3 rounded-lg">
                <Check className="h-5 w-5" />
                <span>Photo ZIP ready!</span>
                <span className="text-xs font-normal text-[var(--ink-2)]">
                  Exported {photoZipState.fileCount} photos. {photoZipState.missingCount > 0 ? `${photoZipState.missingCount} missing/unsupported listed in missing.` : ""}
                </span>
              </div>
            )}

            {photoZipState.type === "error" && (
              <div className="text-rose-500 text-xs font-semibold bg-rose-500/10 p-3 rounded-lg">
                {photoZipState.message}
              </div>
            )}

            <Button
              type="button"
              onClick={handleScanPhotoZip}
              variant="outline"
              className="w-full"
            >
              Re-scan / Export again
            </Button>
          </div>
        )}

        {photoZipState.type === "downloading" && (
          <div className="grid gap-2 py-2">
            <div className="flex items-center justify-center gap-2 text-sm text-[var(--ink-3)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{photoZipState.progress}</span>
            </div>
            <div className="w-full bg-[var(--meter-track)] rounded-full h-2">
              <div className="bg-[var(--flag)] h-2 rounded-full" style={{ width: `${photoZipState.percent}%` }} />
            </div>
          </div>
        )}

        {photoZipState.type === "archiving" && (
          <div className="flex flex-col items-center justify-center py-2 gap-2 text-sm text-[var(--ink-3)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Building ZIP archive... {photoZipState.percent}%</span>
          </div>
        )}
      </div>

      {/* OVERSIZED EXPORT CONFIRMATION MODAL */}
      <ConfirmModal
        open={isConfirmZipWarningOpen}
        onOpenChange={setIsConfirmZipWarningOpen}
        title="Export Large Photo ZIP?"
        description={
          <div className="space-y-2">
            <p>
              Your selection contains <strong>{photoZipState.type === "warning" ? photoZipState.count : 0} photos</strong>, totaling{" "}
              <strong>{photoZipState.type === "warning" ? (photoZipState.bytes / (1024 * 1024)).toFixed(1) : 0} MiB</strong> of uncompressed data.
            </p>
            <p>
              Constructing archives over 250 MiB in the browser is memory-intensive and can crash low-end mobile devices. We recommend using a desktop browser or narrowing the date range.
            </p>
          </div>
        }
        confirmLabel="Continue Download"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (photoZipState.type === "warning") {
            void executePhotoZipDownload(photoZipState.count, photoZipState.bytes);
          }
        }}
      />

      <div className="grid gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-4 text-center shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-3)]">Trip Ticker</p>
        {!tickerData ? (
          <div className="flex items-center justify-center gap-2 py-4 text-[var(--ink-3)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading ticker items...</span>
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-[var(--ink-1)]">
              {tickerData.entries.length} ticker {tickerData.entries.length === 1 ? "item" : "items"} ready for export
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleCopyTicker}
                disabled={tickerData.entries.length === 0}
                variant="outline"
                className="flex-1 border-[var(--line-soft)] bg-[var(--bg-paper)] text-[var(--ink-1)] hover:bg-[var(--meter-track)] hover:text-[var(--ink-1)]"
              >
                {tickerCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {tickerCopied ? "Copied" : "Copy JSON"}
              </Button>
              <Button
                type="button"
                onClick={handleDownloadTicker}
                disabled={tickerData.entries.length === 0}
                className="flex-1 border-0 bg-[var(--flag)] text-[var(--ink-on-brand)] hover:bg-[var(--flag)] hover:opacity-90"
              >
                <Download className="mr-2 h-4 w-4" />
                Download .json
              </Button>
            </div>
          </>
        )}
      </div>
    </SheetBody>
  );
}

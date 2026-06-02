import { useEffect, useState } from "react";
import { Check, Copy, Download, Loader2 } from "lucide-react";
import { useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetTitle,
} from "../../components/ui/sheet";
import { Button } from "../../components/ui/button";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useTheme } from "../../providers/ThemeProvider";
import { cn } from "@/lib/utils";

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

export default function BulkExportSheet({
  open,
  token,
  onOpenChange,
}: BulkExportSheetProps) {
  const [range, setRange] = useState<"all" | "custom">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [includeMysteryMissions, setIncludeMysteryMissions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tickerCopied, setTickerCopied] = useState(false);
  const music = useMusicSafe();
  const { resolvedTheme } = useTheme();
  const log = useDebugLogger("BulkExportSheet", "src/features/options/BulkExportSheet.tsx");
  const dateInputStyle = { colorScheme: resolvedTheme === "constellation" ? "dark" : "light" } as const;

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

  const startMs = startDate ? new Date(startDate).getTime() : undefined;
  const endMs = endDate ? new Date(endDate).getTime() + 86399999 : undefined;

  const queryResult = useQuery(
    tripcastApi.bulkImport.travelerExportTripData,
    open ? { token, startMs, endMs, includeMysteryMissions } : "skip"
  );
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
      log.error("copy:error", "ui", { err });
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
      log.error("copy-ticker:error", "ui", { err });
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
          </div>

          <div className="grid gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-4 text-center shadow-sm">
            {!data ? (
              <div className="flex items-center justify-center gap-2 py-4 text-[var(--ink-3)]">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Preparing export...</span>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-[var(--ink-1)]">
                  {data.entries.length} items ready for export
                </p>
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
      </SheetContent>
    </Sheet>
  );
}

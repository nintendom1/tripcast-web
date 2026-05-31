import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, Copy, Download, Eye, EyeOff, FileJson, RadioTower, RotateCcw } from "lucide-react";
import { useMutation, useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { MysteryMissionImportPreview, MysteryMissionImportResult } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetTitle,
} from "../../components/ui/sheet";
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useMusicSafe } from "../../providers/MusicProvider";
import { cn } from "@/lib/utils";

const SAMPLE_JSON = `{
  "version": 1,
  "missions": [
    {
      "id": "kyoto-fushimi-001",
      "lat": 34.9671,
      "lon": 135.7727,
      "region": "Kyoto",
      "locationName": "Fushimi Inari Taisha",
      "mysteryText": "ReD PAth",
      "trueIntent": "Fushimi Inari is known for its thousands of vermilion torii gates.",
      "spawnRadiusMiles": 30,
      "priority": 3,
      "tags": ["japan", "kyoto", "shrine"]
    }
  ]
}`;

const SCHEMA_REFERENCE = `TripCast Mystery Mission Pack JSON

Required root shape:
{
  "version": 1,
  "missions": []
}

Required mission fields:
- id: stable unique string, reused imports update existing missions.
- lat: number from -90 to 90.
- lon: number from -180 to 180.
- mysteryText: short, cryptic, non-explanatory text such as "ReD PAth" or "gAtE//gAtE".
- trueIntent: reveal text explaining the real reason, fun fact, or contextual note after completion.

Optional fields:
region, locationName, spawnRadiusMiles, priority, tags, recommendedTimeOfDay,
estimatedVisitMinutes, difficulty, sourceHint, expiresAt, spoilerSummary,
locationType, indoorOutdoor, transitFriendly, requiresTicket, timeSensitive.

Guidance:
Choose interesting, reachable destinations. Avoid unsafe, inaccessible, duplicate,
or boring locations. Keep mysteryText uncanny and brief. Keep trueIntent useful,
surprising, and safe to reveal after completion.`;

type Props = {
  open: boolean;
  token: string;
  onOpenChange: (open: boolean) => void;
  onImported?: (result: MysteryMissionImportResult) => void;
};

function parseJson(text: string) {
  return JSON.parse(text) as unknown;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 text-center shadow-sm">
      <p className="font-[var(--font-display)] text-xl font-extrabold text-[var(--ink-1)]">{value}</p>
      <p className="font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {label}
      </p>
    </div>
  );
}

export default function MysteryMissionsSheet({
  open,
  token,
  onOpenChange,
  onImported,
}: Props) {
  const [text, setText] = useState("");
  const [payload, setPayload] = useState<unknown | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState<"schema" | "export" | null>(null);
  const [spoilerSafe, setSpoilerSafe] = useState(true);
  const log = useDebugLogger("MysteryMissionsSheet", "src/features/options/MysteryMissionsSheet.tsx");
  const music = useMusicSafe();

  useEffect(() => {
    log.logUi(open ? "sheet:open" : "sheet:close");
    if (!open) {
      setPayload(null);
      setParseError(null);
      setCommitError(null);
      setWorking(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useActiveUiContext(open, {
    sheetName: "MysteryMissionsSheet",
    label: "Mystery Missions",
    source: "options:mystery-missions",
    sourceLabel: "Options -> Mystery Missions",
    file: "src/features/options/MysteryMissionsSheet.tsx",
  }, { boundsSelector: "[data-role='mystery-missions-sheet']" });

  const settings = useQuery(
    tripcastApi.mysteryMissions.travelerGetMysteryMissionSettings,
    open ? { token } : "skip",
  );
  const management = useQuery(
    tripcastApi.mysteryMissions.travelerListMysteryMissions,
    open ? { token } : "skip",
  );
  const preview = useQuery(
    tripcastApi.mysteryMissions.previewMysteryMissionImport,
    payload ? { token, payload } : "skip",
  ) as MysteryMissionImportPreview | undefined;
  const exportData = useQuery(
    tripcastApi.mysteryMissions.travelerExportMysteryMissions,
    open ? { token } : "skip",
  );
  const setEnabled = useMutation(tripcastApi.mysteryMissions.travelerSetMysteryMissionsEnabled);
  const importMissions = useMutation(tripcastApi.mysteryMissions.travelerImportMysteryMissions);

  const enabled = settings?.enabled ?? false;
  const counts = management?.counts;
  const exportText = useMemo(
    () => (exportData ? JSON.stringify(exportData, null, 2) : ""),
    [exportData],
  );

  function validate() {
    setParseError(null);
    setCommitError(null);
    try {
      setPayload(parseJson(text));
      log.logUi("action:validate");
    } catch (error) {
      setPayload(null);
      setParseError(errorText(error));
    }
  }

  async function commit() {
    if (!payload || !preview?.valid || working) return;
    setWorking(true);
    setCommitError(null);
    log.logUi("action:import", { count: preview.counts.total });
    try {
      const result = await importMissions({ token, payload });
      music.sfx("success");
      onImported?.(result);
    } catch (error) {
      setCommitError(errorText(error));
    } finally {
      setWorking(false);
    }
  }

  async function copySchema() {
    await navigator.clipboard.writeText(SCHEMA_REFERENCE);
    setCopied("schema");
    setTimeout(() => setCopied(null), 1600);
    log.logUi("action:copy-schema");
  }

  async function copyExport() {
    if (!exportText) return;
    await navigator.clipboard.writeText(exportText);
    setCopied("export");
    setTimeout(() => setCopied(null), 1600);
    log.logUi("action:copy-export");
  }

  function downloadExport() {
    if (!exportText) return;
    const blob = new Blob([exportText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tripcast-mystery-missions-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    log.logUi("action:download-export");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-role="mystery-missions-sheet"
        className="max-h-[88dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
      >
        <div className="flex items-start justify-between gap-2 px-5 pt-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-950 text-zinc-100">
              <RadioTower className="h-5 w-5" aria-hidden="true" />
            </span>
            <SheetTitle className="font-[var(--font-display)] text-2xl font-extrabold tracking-tight text-[var(--ink-1)]">
              Mystery Missions
            </SheetTitle>
          </div>
          <SheetCloseButton aria-label="Close Mystery Missions" />
        </div>

        <SheetBody className="grid gap-5 px-5 py-4 text-[var(--ink-1)]">
          <section className="grid gap-3">
            <label className="flex min-h-14 cursor-pointer items-center justify-between rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-3">
              <span>
                <span className="block text-sm font-semibold">Mystery Missions</span>
                <span className="block text-xs text-[var(--ink-3)]">Signals appear when live location is near an imported Mystery.</span>
              </span>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => {
                  log.logUi("action:toggle-enabled", { enabled: event.target.checked });
                  void setEnabled({ token, enabled: event.target.checked });
                }}
                className="h-5 w-5"
                style={{ accentColor: "var(--ink-1)" }}
              />
            </label>

            {counts ? (
              <div className="grid grid-cols-5 gap-2">
                <CountTile label="Total" value={counts.total} />
                <CountTile label="Signal" value={counts.signal} />
                <CountTile label="Dormant" value={counts.dormant} />
                <CountTile label="Done" value={counts.completed} />
                <CountTile label="Gone" value={counts.dismissed} />
              </div>
            ) : null}
          </section>

          <section className="grid gap-3">
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => setSpoilerSafe((value) => !value)}>
                {spoilerSafe ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
                Spoiler Safe {spoilerSafe ? "On" : "Off"}
              </Button>
              <Button type="button" variant="outline" onClick={copySchema}>
                {copied === "schema" ? <Check className="mr-1.5 h-4 w-4" /> : <FileJson className="mr-1.5 h-4 w-4" />}
                {copied === "schema" ? "Copied" : "Copy Schema"}
              </Button>
            </div>

            <textarea
              className="min-h-56 w-full resize-y rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 font-[var(--font-mono)] text-xs leading-relaxed text-[var(--ink-1)] shadow-sm outline-none placeholder:text-[var(--ink-3)] focus:border-[var(--ink-1)] focus:ring-1 focus:ring-[var(--ink-1)]"
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
              aria-label="Mystery Mission JSON"
            />

            {parseError ? (
              <p role="alert" className="rounded-xl border border-[var(--ink-danger)] bg-[var(--bg-danger)] px-3 py-2 text-sm text-[var(--ink-danger)]">
                {parseError}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setText(SAMPLE_JSON)}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Sample
              </Button>
              <Button type="button" onClick={validate}>
                <ClipboardList className="mr-1.5 h-4 w-4" />
                Validate
              </Button>
            </div>
          </section>

          {payload ? (
            <section className="grid gap-3">
              {!preview ? (
                <p className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--ink-3)]">
                  Validating...
                </p>
              ) : preview.valid ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <CountTile label="Total" value={preview.counts.total} />
                    <CountTile label="New" value={preview.counts.create} />
                    <CountTile label="Update" value={preview.counts.update} />
                  </div>
                  <div className="grid gap-2">
                    {preview.rows.slice(0, 8).map((row) => (
                      <div key={row.id} className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 text-sm">
                        <p className={cn("font-semibold", spoilerSafe && "blur-sm select-none")}>
                          {spoilerSafe ? "Mystery Signal" : row.id}
                        </p>
                        <p className="text-xs text-[var(--ink-3)]">
                          {row.region ?? "Unknown region"} · priority {row.priority}
                          {row.tags?.length ? ` · ${row.tags.join(", ")}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                  {commitError ? <p role="alert" className="text-sm text-[var(--ink-danger)]">{commitError}</p> : null}
                  <Button type="button" disabled={working} onClick={commit}>
                    {working ? "Importing..." : "Import Mystery Missions"}
                  </Button>
                </>
              ) : (
                <div className="grid gap-2 rounded-xl border border-[var(--ink-danger)] bg-[var(--bg-danger)] p-3 text-sm text-[var(--ink-danger)]">
                  <p className="font-semibold">Validation failed</p>
                  {preview.errors.map((error, index) => (
                    <p key={index}>{error.index !== undefined ? `Mission ${error.index + 1}: ` : ""}{error.message}</p>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <section className="grid gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-4">
            <p className="text-sm font-semibold">Export current pack</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" disabled={!exportText} onClick={copyExport}>
                {copied === "export" ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
                {copied === "export" ? "Copied" : "Copy JSON"}
              </Button>
              <Button type="button" className="flex-1" disabled={!exportText} onClick={downloadExport}>
                <Download className="mr-1.5 h-4 w-4" />
                Download
              </Button>
            </div>
          </section>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

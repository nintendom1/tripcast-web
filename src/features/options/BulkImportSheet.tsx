import { useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ClipboardList,
  FileJson,
  RotateCcw,
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";

import {
  tripcastApi,
  type BulkImportEntry,
  type BulkImportPayload,
  type BulkImportPreview,
  type BulkImportResult,
} from "../../convex/tripcastApi";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetTitle,
} from "../../components/ui/sheet";
import { Button } from "../../components/ui/button";
import { cn } from "@/lib/utils";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import { useDebugLogger } from "../../debug/useDebugLogger";

const SAMPLE_JSON = `{
  "timeZone": "America/Los_Angeles",
  "entries": [
    {
      "kind": "story",
      "ref": "story:king-street-station",
      "timeZone": "America/Los_Angeles",
      "occurredAt": "2026-05-14",
      "title": "Arrived under the clock tower",
      "body": "Stepping out near King Street Station made Seattle feel instantly cinematic. The old clock tower rose above the street, the stadiums sat just to the south, and the skyline peeked through the gray morning like the city was slowly waking up. After the ride in, I felt that little Seattle shift: damp air, coffee nearby, and hills waiting in every direction.",
      "locationLabel": "King Street Station",
      "lat": 47.5983,
      "lon": -122.3299
    },
    {
      "kind": "story",
      "ref": "story:pike-place-rain",
      "timeZone": "America/Los_Angeles",
      "occurredAt": "2026-05-14T10:15:00-07:00",
      "title": "Morning at the market",
      "body": "Pike Place Market was already alive when I arrived. Fishmongers called across the stalls, flower bouquets spilled color into the walkways, and the smell of coffee and fresh bread seemed to drift from every corner.\\n\\nI wandered without much of a plan, which turned out to be the right plan. Seattle felt best when I let myself follow the sound of buskers, the slope of the streets, and whatever view of Elliott Bay appeared between the buildings.",
      "locationLabel": "Pike Place Market",
      "lat": 47.6097,
      "lon": -122.3425
    },
    {
      "kind": "story",
      "ref": "story:kerry-park-view",
      "timeZone": "America/Los_Angeles",
      "occurredAt": 1778898600000,
      "title": "Skyline at golden hour",
      "body": "The city opened up from Kerry Park like a postcard: the Space Needle in front, downtown stacked behind it, and Mount Rainier faintly holding the horizon. I stayed longer than planned, watching the light change across the skyline until Seattle felt both huge and strangely personal.",
      "locationLabel": "Kerry Park",
      "lat": 47.6295,
      "lon": -122.3599
    },
    {
      "kind": "route_vote",
      "ref": "vote:ferry-or-neighborhood",
      "timeZone": "America/Los_Angeles",
      "occurredAt": "2026-05-14",
      "expiresAt": "2026-05-15T09:00:00-07:00",
      "title": "Bainbridge ferry or Capitol Hill food crawl?",
      "options": [
        { "ref": "option:bainbridge", "title": "Ride the ferry to Bainbridge Island", "locationLabel": "Seattle Ferry Terminal", "lat": 47.6026, "lon": -122.3393 },
        { "ref": "option:capitol-hill", "title": "Explore Capitol Hill", "locationLabel": "Capitol Hill", "lat": 47.6253, "lon": -122.3222 }
      ]
    },
    {
      "kind": "mission",
      "ref": "mission:bainbridge-ferry",
      "timeZone": "America/Los_Angeles",
      "occurredAt": "2026-05-15",
      "title": "Take the ferry across Puget Sound",
      "status": "planned",
      "sourceRouteVoteRef": "vote:ferry-or-neighborhood",
      "sourceRouteVoteOptionRef": "option:bainbridge",
      "estimatedCostUsd": 10,
      "estimatedDurationMinutes": 180,
      "estimatedEnergyImpact": "medium"
    },
    {
      "kind": "transaction",
      "ref": "tx:coffee",
      "timeZone": "America/Los_Angeles",
      "occurredAt": "2026-05-14T09:30:00-07:00",
      "title": "Latte near Pioneer Square",
      "category": "food",
      "currencyCode": "USD",
      "localAmount": 6.5,
      "localCurrencyPerUsd": 1,
      "visibility": "public",
      "countsTowardMeter": true,
      "linkedToRef": "story:king-street-station"
    }
  ]
}`;

const BULK_IMPORT_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "TripCast Bulk Import",
  oneOf: [
    { $ref: "#/definitions/entryArray" },
    {
      type: "object",
      properties: {
        timeZone: { type: "string" },
        entries: { $ref: "#/definitions/entryArray" },
      },
      required: ["entries"],
      additionalProperties: false,
    },
  ],
  definitions: {
    entryArray: {
      type: "array",
      items: { $ref: "#/definitions/entry" },
      maxItems: 50,
    },
    timestamp: {
      oneOf: [
        { type: "number", description: "Epoch milliseconds" },
        { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "YYYY-MM-DD" },
        { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T.*(?:Z|[+-]\\d{2}:\\d{2})$", description: "ISO 8601 with offset" },
      ],
    },
    entry: {
      type: "object",
      required: ["kind"],
      properties: {
        kind: { enum: ["checkin", "story", "transaction", "mission", "route_vote", "vote"] },
        ref: { type: "string", maxLength: 80 },
        timeZone: { type: "string" },
        occurredAt: { $ref: "#/definitions/timestamp" },
        when: { $ref: "#/definitions/timestamp" },
      },
      allOf: [
        {
          if: { properties: { kind: { enum: ["checkin", "story"] } } },
          then: {
            properties: {
              title: { type: "string", maxLength: 120 },
              note: { type: "string", maxLength: 1000 },
              body: { type: "string", maxLength: 1000 },
              locationLabel: { type: "string", maxLength: 120 },
              place: { type: "string", maxLength: 120 },
              lat: { type: "number", minimum: -90, maximum: 90 },
              lon: { type: "number", minimum: -180, maximum: 180 },
              showInStory: { type: "boolean" },
              source: { enum: ["right_click", "tap_add_mode", "long_press", "current_activity"] },
            },
            required: ["lat", "lon"],
          },
        },
        {
          if: { properties: { kind: { const: "transaction" } } },
          then: {
            properties: {
              title: { type: "string", maxLength: 200 },
              note: { type: "string", maxLength: 500 },
              category: { enum: ["food", "transport", "lodging", "event", "shopping", "souvenirs", "logistics", "research", "other"] },
              currencyCode: { type: "string", pattern: "^[A-Z]{3}$" },
              localAmount: { type: "number" },
              amount: { type: "number" },
              localCurrencyPerUsd: { type: "number" },
              countsTowardMeter: { type: "boolean" },
              visibility: { enum: ["public", "summary_only", "private"] },
              linkedToRef: { type: "string", maxLength: 80 },
            },
            required: ["title"],
          },
        },
        {
          if: { properties: { kind: { const: "mission" } } },
          then: {
            properties: {
              title: { type: "string", maxLength: 200 },
              description: { type: "string", maxLength: 2000 },
              note: { type: "string", maxLength: 2000 },
              status: { enum: ["proposed", "visible", "planned", "in_progress", "completed", "dropped"] },
              locationLabel: { type: "string", maxLength: 120 },
              loc: { type: "string", maxLength: 120 },
              lat: { type: "number", minimum: -90, maximum: 90 },
              lon: { type: "number", minimum: -180, maximum: 180 },
              estimatedCostUsd: { type: "number" },
              estimatedDurationMinutes: { type: "number" },
              estimatedEnergyImpact: { enum: ["low", "medium", "high"] },
              sourceRouteVoteRef: { type: "string", maxLength: 80 },
              sourceRouteVoteOptionRef: { type: "string", maxLength: 80 },
            },
            required: ["title"],
          },
        },
        {
          if: { properties: { kind: { enum: ["route_vote", "vote"] } } },
          then: {
            properties: {
              title: { type: "string", maxLength: 200 },
              description: { type: "string", maxLength: 2000 },
              status: { enum: ["draft", "active", "closed", "resolved", "cancelled", "archived"] },
              expiresAt: { $ref: "#/definitions/timestamp" },
              resultsVisibility: { enum: ["before_voting", "after_voting", "after_close", "traveler_only"] },
              options: {
                type: "array",
                items: {
                  type: "object",
                  required: ["title"],
                  properties: {
                    ref: { type: "string", maxLength: 80 },
                    title: { type: "string", maxLength: 200 },
                    description: { type: "string", maxLength: 2000 },
                    sub: { type: "string", maxLength: 2000 },
                    locationLabel: { type: "string", maxLength: 120 },
                    place: { type: "string", maxLength: 120 },
                    lat: { type: "number", minimum: -90, maximum: 90 },
                    lon: { type: "number", minimum: -180, maximum: 180 },
                    estimatedCostUsd: { type: "number" },
                    estimatedDurationMinutes: { type: "number" },
                    estimatedEnergyImpact: { enum: ["low", "medium", "high"] },
                  },
                },
              },
              confirmedWinningOptionRef: { type: "string", maxLength: 80 },
              resultingMissionRef: { type: "string", maxLength: 80 },
            },
            required: ["title", "options"],
          },
        },
      ],
    },
  },
};

type BulkImportSheetProps = {
  open: boolean;
  token: string;
  onOpenChange: (open: boolean) => void;
  onImported?: (result: BulkImportResult) => void;
};

type Stage = "paste" | "preview" | "done";

function parsePayload(text: string): BulkImportPayload {
  const parsed = JSON.parse(text) as unknown;
  if (Array.isArray(parsed)) {
    return parsed as BulkImportEntry[];
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    Array.isArray((parsed as { entries?: unknown }).entries)
  ) {
    return parsed as BulkImportPayload;
  }
  throw new Error("Root must be a JSON array or an object with an entries array.");
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function BulkImportSheet({
  open,
  token,
  onOpenChange,
  onImported,
}: BulkImportSheetProps) {
  const [stage, setStage] = useState<Stage>("paste");
  const [text, setText] = useState("");
  const [entries, setEntries] = useState<BulkImportPayload | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isSchemaCopied, setIsSchemaCopied] = useState(false);
  const music = useMusicSafe();
  const log = useDebugLogger("BulkImportSheet", "src/features/options/BulkImportSheet.tsx");

  useEffect(() => {
    log.logUi(open ? "sheet:open" : "sheet:close");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useActiveUiContext(open, {
    sheetName: "BulkImportSheet",
    label: "Bulk Import",
    view: stage,
    source: "options:bulk-import",
    sourceLabel: "Options -> Bulk Import",
    file: "src/features/options/BulkImportSheet.tsx",
  }, { boundsSelector: "[data-role='bulk-import-sheet']" });

  const preview = useQuery(
    tripcastApi.bulkImport.previewBulkImport,
    entries ? { token, entries } : "skip",
  ) as BulkImportPreview | undefined;
  const commitBulkImport = useMutation(tripcastApi.bulkImport.travelerBulkImport);

  useEffect(() => {
    if (!open) {
      setStage("paste");
      setEntries(null);
      setParseError(null);
      setCommitError(null);
      setResult(null);
      setIsCommitting(false);
    }
  }, [open]);

  function validate() {
    setParseError(null);
    setCommitError(null);
    try {
      const nextEntries = parsePayload(text);
      setEntries(nextEntries);
      setStage("preview");
    } catch (error) {
      setEntries(null);
      setParseError(errorText(error));
    }
  }

  async function copySchema() {
    music.sfx("tap");
    log.logUi("action:copy-schema");
    await navigator.clipboard.writeText(JSON.stringify(BULK_IMPORT_SCHEMA, null, 2));
    setIsSchemaCopied(true);
    setTimeout(() => setIsSchemaCopied(false), 2000);
  }

  async function commit() {
    if (!entries || !preview?.valid || isCommitting) return;
    log.logUi("action:commit-import", { count: preview?.rows.length });
    setCommitError(null);
    setIsCommitting(true);
    try {
      const nextResult = await commitBulkImport({ token, entries });
      setResult(nextResult);
      setStage("done");
      music.sfx("success");
      onImported?.(nextResult);
    } catch (error) {
      setCommitError(errorText(error));
    } finally {
      setIsCommitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) log.logUi("sheet:close", { trigger: "backdrop" });
    onOpenChange(nextOpen);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        data-role="bulk-import-sheet"
        className="max-h-[88dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
      >
        <div className="flex items-start justify-between gap-2 px-5 pt-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <SheetTitle className="font-[var(--font-display)] text-2xl font-extrabold tracking-tight text-[var(--ink-1)]">
              Bulk Import
            </SheetTitle>
          </div>
          <SheetCloseButton aria-label="Close bulk import" />
        </div>

        <SheetBody className="grid gap-4 px-5">
          {stage === "paste" ? (
            <>
              <p className="text-sm leading-relaxed text-[var(--ink-2)]">
                Paste a JSON array or {"{ timeZone, entries }"} object with up to 50 entries.
                Supported kinds are checkin, story, transaction, mission, and route vote.
                Timestamps can be epoch milliseconds, ISO strings with an offset, or YYYY-MM-DD dates.
              </p>
              <textarea
                className="min-h-64 w-full resize-y rounded-xl border border-[var(--line-soft)] bg-[var(--bg-ink)] p-3 font-[var(--font-mono)] text-xs leading-relaxed text-[var(--ink-on-dark)] outline-none focus:border-[var(--flag)]"
                value={text}
                onChange={(event) => setText(event.target.value)}
                spellCheck={false}
                aria-label="Bulk import JSON"
              />
              {parseError ? (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {parseError}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    music.sfx("tap");
                    log.logUi("action:insert-sample");
                    setText(SAMPLE_JSON);
                  }}
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Insert Sample
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={copySchema}
                >
                  {isSchemaCopied ? (
                    <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  ) : (
                    <FileJson className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  )}
                  {isSchemaCopied ? "Copied!" : "Copy Schema"}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    music.sfx("page");
                    log.logUi("action:validate-preview");
                    validate();
                  }}
                >
                  <ClipboardList className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Validate & Preview
                </Button>
              </div>
            </>
          ) : null}

          {stage === "preview" ? (
            <>
              <PreviewSummary preview={preview} />
              {preview?.valid ? (
                <div className="grid gap-2">
                  {preview.rows.map((row) => (
                    <div
                      key={`${row.index}-${row.ref ?? row.title}`}
                      className="rounded-xl bg-[var(--bg-card)] p-3 shadow-sm"
                    >
                      <div className="flex items-start gap-2">
                        <span className="rounded-full bg-[var(--meter-track)] px-2 py-0.5 font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                          {row.kind}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[var(--ink-1)]">{row.title}</p>
                          {row.detail ? <p className="text-xs text-[var(--ink-3)]">{row.detail}</p> : null}
                          {row.links.length > 0 ? (
                            <p className="mt-1 text-xs text-[var(--teal)]">{row.links.join(" · ")}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {commitError ? (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {commitError}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    music.sfx("page");
                    log.logUi("action:back-to-paste");
                    setStage("paste");
                  }}
                >
                  <ChevronLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
                <Button type="button" disabled={!preview?.valid || isCommitting} onClick={commit}>
                  <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {isCommitting ? "Importing..." : `Commit ${preview?.rows.length ?? 0} Entries`}
                </Button>
              </div>
            </>
          ) : null}

          {stage === "done" && result ? (
            <div className="grid gap-4 py-8 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--green)_16%,transparent)] text-[var(--green)]">
                <Check className="h-8 w-8" aria-hidden="true" />
              </div>
              <div>
                <p className="font-[var(--font-display)] text-2xl font-extrabold text-[var(--ink-1)]">
                  {result.imported} entries imported
                </p>
                <p className="mt-1 text-sm text-[var(--ink-2)]">
                  {result.counts.checkins} check-ins, {result.counts.transactions} transactions,{" "}
                  {result.counts.missions} missions, {result.counts.routeVotes} route votes.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => {
                  music.sfx("page");
                  log.logUi("action:close-import-done");
                  onOpenChange(false);
                }}
              >
                Back to Options
              </Button>
            </div>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function PreviewSummary({ preview }: { preview: BulkImportPreview | undefined }) {
  if (!preview) {
    return <p role="status" className="text-sm text-[var(--ink-2)]">Validating...</p>;
  }
  if (!preview.valid) {
    return (
      <div className="grid gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <p className="font-semibold">Validation failed</p>
        {preview.errors.map((error, index) => (
          <p key={index}>
            {error.index !== undefined ? `Entry ${error.index + 1}: ` : ""}
            {error.message}
          </p>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-2">
      {[
        ["Pins", preview.counts.checkins],
        ["Funds", preview.counts.transactions],
        ["Missions", preview.counts.missions],
        ["Votes", preview.counts.routeVotes],
      ].map(([label, value]) => (
        <div key={label} className={cn("rounded-xl bg-[var(--bg-card)] p-3 text-center shadow-sm")}>
          <p className="font-[var(--font-display)] text-xl font-extrabold text-[var(--ink-1)]">{value}</p>
          <p className="font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            {label}
          </p>
        </div>
      ))}
    </div>
  );
}

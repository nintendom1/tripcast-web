import { useEffect, useState } from "react";
import { Check, ChevronLeft, ClipboardList, FileJson, RotateCcw } from "lucide-react";
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
  SheetGrabber,
  SheetKicker,
  SheetTitle,
} from "../../components/ui/sheet";
import { Button } from "../../components/ui/button";
import { cn } from "@/lib/utils";

const SAMPLE_JSON = `{
  "timeZone": "Asia/Tokyo",
  "entries": [
    {
      "kind": "story",
      "ref": "story:kyoto-station",
      "timeZone": "Asia/Tokyo",
      "occurredAt": "2026-05-18",
      "title": "Got off the bullet train",
      "body": "Got off the bullet train at Kyoto Station and immediately felt that little shift in the air, like the city was inviting me to slow down. After the smoothness of the Shinkansen, stepping onto the platform made everything feel suddenly real: I was finally here, in Kyoto.",
      "locationLabel": "Kyoto Station",
      "lat": 34.9858,
      "lon": 135.7587
    },
    {
      "kind": "story",
      "ref": "story:tokyo-glow",
      "timeZone": "Asia/Tokyo",
      "occurredAt": "2026-05-19T20:15:00+09:00",
      "title": "Lost in the glow",
      "body": "Tokyo felt impossibly huge the moment I stepped out into the city. Neon signs blinked above crosswalks, train announcements echoed in the distance, and everyone seemed to know exactly where they were going except me.\\n\\nSomewhere between checking my map and pretending I knew what I was doing, I realized that being a little lost was part of the fun.",
      "locationLabel": "Tokyo Station",
      "lat": 35.6812,
      "lon": 139.7671
    },
    {
      "kind": "story",
      "ref": "story:shibuya-current",
      "timeZone": "Asia/Tokyo",
      "occurredAt": 1779285600000,
      "title": "Crossing into the current",
      "body": "Tokyo rushed around me in every direction, with trains humming below, screens glowing above, and crowds flowing through the streets like a living river. For a moment, I stopped trying to keep up and just let the city carry me.",
      "locationLabel": "Shibuya Crossing",
      "lat": 35.6595,
      "lon": 139.7005
    },
    {
      "kind": "route_vote",
      "ref": "vote:nara-or-osaka",
      "timeZone": "Asia/Tokyo",
      "occurredAt": "2026-05-20",
      "expiresAt": "2026-05-22T09:00:00+09:00",
      "title": "Nara deer or Osaka food?",
      "options": [
        { "ref": "option:nara", "title": "Nara Park", "locationLabel": "Nara", "lat": 34.6851, "lon": 135.8048 },
        { "ref": "option:osaka", "title": "Dotonbori", "locationLabel": "Osaka", "lat": 34.6687, "lon": 135.5012 }
      ]
    },
    {
      "kind": "challenge",
      "ref": "mission:nara-deer",
      "timeZone": "Asia/Tokyo",
      "occurredAt": "2026-05-23",
      "title": "See deer at Nara Park",
      "status": "planned",
      "sourceRouteVoteRef": "vote:nara-or-osaka",
      "sourceRouteVoteOptionRef": "option:nara",
      "estimatedCostUsd": 12,
      "estimatedDurationMinutes": 180,
      "estimatedEnergyImpact": "medium"
    },
    {
      "kind": "transaction",
      "ref": "tx:coffee",
      "timeZone": "Asia/Tokyo",
      "occurredAt": "2026-05-18T09:30:00+09:00",
      "title": "Flat white",
      "category": "food",
      "currencyCode": "JPY",
      "localAmount": 700,
      "localCurrencyPerUsd": 150,
      "visibility": "public",
      "countsTowardMeter": true,
      "linkedToRef": "story:kyoto-station"
    }
  ]
}`;

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
  const [text, setText] = useState(SAMPLE_JSON);
  const [entries, setEntries] = useState<BulkImportPayload | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);

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

  async function commit() {
    if (!entries || !preview?.valid || isCommitting) return;
    setCommitError(null);
    setIsCommitting(true);
    try {
      const nextResult = await commitBulkImport({ token, entries });
      setResult(nextResult);
      setStage("done");
      onImported?.(nextResult);
    } catch (error) {
      setCommitError(errorText(error));
    } finally {
      setIsCommitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[88dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
      >
        <SheetGrabber />
        <div className="flex items-start justify-between gap-2 px-5 pt-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <SheetKicker dotColor="var(--teal)">
              <FileJson className="h-3 w-3" aria-hidden="true" />
              Data · Import
            </SheetKicker>
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
                Supported kinds are checkin, story, transaction, challenge, and route vote.
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
                <Button type="button" variant="outline" onClick={() => setText(SAMPLE_JSON)}>
                  <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Reset sample
                </Button>
                <Button type="button" onClick={validate}>
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
                <Button type="button" variant="outline" onClick={() => setStage("paste")}>
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
                  {result.counts.challenges} missions, {result.counts.routeVotes} route votes.
                </p>
              </div>
              <Button type="button" onClick={() => onOpenChange(false)}>
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
        ["Missions", preview.counts.challenges],
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

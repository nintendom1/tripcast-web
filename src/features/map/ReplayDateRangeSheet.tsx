import { useEffect, useMemo, useState } from "react";

import { Sheet, SheetContent, SheetTitle } from "../../components/ui/sheet";

export interface ReplayDateRangeSheetProps {
  open: boolean;
  bounds: { min: number; max: number } | null;
  window: { startAt: number; endAt: number } | null;
  timeZone: string;
  onApply: (startAt: number, endAt: number) => void;
  onReset: () => void;
  onClose: () => void;
}

const LAST_RANGE_KEY = "tripcast.replay.lastCustomRange";

function partsInZone(timestamp: number, timeZone: string) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  return values as Record<"year" | "month" | "day" | "hour" | "minute" | "second", string>;
}

function inputValue(timestamp: number, timeZone: string) {
  const p = partsInZone(timestamp, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function zoneOffsetMs(timestamp: number, timeZone: string) {
  const p = partsInZone(timestamp, timeZone);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - timestamp;
}

function parseInput(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const local = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5]);
  const first = local - zoneOffsetMs(local, timeZone);
  const timestamp = local - zoneOffsetMs(first, timeZone);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function startOfZonedDay(timestamp: number, timeZone: string) {
  const p = partsInZone(timestamp, timeZone);
  return parseInput(`${p.year}-${p.month}-${p.day}T00:00`, timeZone) ?? timestamp;
}

export default function ReplayDateRangeSheet({
  open,
  bounds,
  window,
  timeZone,
  onApply,
  onReset,
  onClose,
}: ReplayDateRangeSheetProps) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => {
    if (!open) return;
    let saved: { startAt: number; endAt: number } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(LAST_RANGE_KEY) ?? "null") as typeof saved;
    } catch {
      saved = null;
    }
    const range = window ?? saved ?? (bounds ? { startAt: bounds.min, endAt: bounds.max } : null);
    if (!range) return;
    setStart(inputValue(range.startAt, timeZone));
    setEnd(inputValue(range.endAt, timeZone));
  }, [open, bounds, window, timeZone]);

  const parsed = useMemo(() => {
    const startAt = parseInput(start, timeZone);
    const endAt = parseInput(end, timeZone);
    return startAt !== null && endAt !== null && startAt <= endAt ? { startAt, endAt } : null;
  }, [start, end, timeZone]);

  const applyShortcut = (kind: "today" | "yesterday" | "last24") => {
    const now = Date.now();
    const today = startOfZonedDay(now, timeZone);
    const startAt = kind === "today" ? today : kind === "yesterday" ? today - 86_400_000 : now - 86_400_000;
    const endAt = kind === "yesterday" ? today - 1 : now;
    setStart(inputValue(Math.max(bounds?.min ?? startAt, startAt), timeZone));
    setEnd(inputValue(Math.min(bounds?.max ?? endAt, endAt), timeZone));
  };

  return (
    <Sheet open={open} modal={false} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="bottom" showBackdrop={false} className="z-[60] mx-auto max-w-md gap-5 rounded-t-xl px-5 pb-8 pt-3" aria-label="Replay date range">
        <div className="mx-auto h-1 w-12 rounded-full bg-[var(--line-soft)]" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <button type="button" onClick={onClose} className="text-sm font-medium text-[var(--ink-2)]">Cancel</button>
          <SheetTitle className="text-base font-semibold text-[var(--ink-1)]">Custom Date Range</SheetTitle>
          <button type="button" disabled={!parsed} onClick={() => {
            if (!parsed) return;
            try { localStorage.setItem(LAST_RANGE_KEY, JSON.stringify(parsed)); } catch { /* best effort */ }
            onApply(parsed.startAt, parsed.endAt);
          }} className="text-sm font-semibold text-[var(--flag)] disabled:opacity-40">Apply</button>
        </div>

        <p className="text-center text-xs text-[var(--ink-3)]">Times use {timeZone}.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium text-[var(--ink-2)]">Start
            <input type="datetime-local" value={start} onChange={(event) => setStart(event.currentTarget.value)} className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--ink-1)]" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--ink-2)]">End
            <input type="datetime-local" value={end} onChange={(event) => setEnd(event.currentTarget.value)} className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--ink-1)]" />
          </label>
        </div>
        {!parsed && start && end ? <p role="alert" className="text-xs text-[var(--ink-danger)]">End must be at or after start.</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => applyShortcut("today")} className="rounded-full bg-[var(--meter-track)] py-2 text-xs font-semibold">Today</button>
          <button type="button" onClick={() => applyShortcut("yesterday")} className="rounded-full bg-[var(--meter-track)] py-2 text-xs font-semibold">Yesterday</button>
          <button type="button" onClick={() => applyShortcut("last24")} className="rounded-full bg-[var(--meter-track)] py-2 text-xs font-semibold">Last 24 hours</button>
          <button type="button" onClick={onReset} disabled={!bounds} className="rounded-full bg-[var(--meter-track)] py-2 text-xs font-semibold disabled:opacity-40">Full trip</button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

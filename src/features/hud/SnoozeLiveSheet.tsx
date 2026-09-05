import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import {
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import {
  formatSnoozeOccurrence,
  nextOccurrence,
  presetSnoozeTime,
  timeInputValue,
} from "../../lib/liveSnooze";

export type SnoozeLiveSheetProps = {
  open: boolean;
  snoozedUntil?: number | null;
  now?: Date;
  onOpenChange: (open: boolean) => void;
  onConfirm: (until: number) => void;
  onCancelSnooze?: () => void;
};

export function SnoozeLiveSheet({
  open,
  snoozedUntil = null,
  now: fixedNow,
  onOpenChange,
  onConfirm,
  onCancelSnooze,
}: SnoozeLiveSheetProps) {
  const getNow = useCallback(() => fixedNow ?? new Date(), [fixedNow]);
  const [time, setTime] = useState(() =>
    snoozedUntil ? timeInputValue(new Date(snoozedUntil)) : presetSnoozeTime(30, getNow()),
  );

  useEffect(() => {
    if (!open) return;
    setTime(snoozedUntil ? timeInputValue(new Date(snoozedUntil)) : presetSnoozeTime(30, getNow()));
  }, [getNow, open, snoozedUntil]);

  const until = useMemo(() => {
    try {
      return nextOccurrence(time, getNow());
    } catch {
      return null;
    }
  }, [getNow, time]);

  return (
    <Sheet open={open} modal={false} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showBackdrop={false}
        className="rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] pb-[calc(env(safe-area-inset-bottom)+5.5rem)] shadow-[var(--shadow-sheet)]"
        data-role="snooze-live-sheet"
      >
        <SheetHeader className="flex-row items-start justify-between space-y-0">
          <div className="min-w-0 space-y-1.5">
            <SheetTitle>{snoozedUntil ? "Edit Live snooze" : "Snooze Live"}</SheetTitle>
            <SheetDescription>
              GPS and Motion will turn off. Saved breadcrumbs can still finish sending.
            </SheetDescription>
          </div>
          <SheetCloseButton className="shrink-0" />
        </SheetHeader>
        <div className="grid gap-4 px-4">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => setTime(presetSnoozeTime(30, getNow()))}>
              30 min
            </Button>
            <Button type="button" variant="outline" onClick={() => setTime(presetSnoozeTime(60, getNow()))}>
              1 hr
            </Button>
          </div>
          <label className="grid gap-2 text-sm font-semibold text-[var(--ink-1)]">
            Resume time
            <input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="min-h-12 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 text-base text-[var(--ink-1)]"
            />
          </label>
          <p className="text-center text-sm font-semibold text-[var(--ink-2)]">
            {until ? formatSnoozeOccurrence(until, getNow()) : "Choose a resume time"}
          </p>
          <Button
            type="button"
            disabled={until === null}
            onClick={() => {
              if (until === null) return;
              onConfirm(until);
              onOpenChange(false);
            }}
          >
            {snoozedUntil ? "Update snooze" : "Snooze Live"}
          </Button>
          {snoozedUntil && onCancelSnooze ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onCancelSnooze();
                onOpenChange(false);
              }}
            >
              Cancel snooze
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

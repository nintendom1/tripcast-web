import { useEffect } from "react";
import { Camera } from "lucide-react";

import type { HistoryEvent } from "../../convex/tripcastApi";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetGrabber,
  SheetKicker,
  SheetTitle,
} from "../../components/ui/sheet";
import { RevealText } from "../../components/ui/RevealText";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

type StoryDetailSheetProps = {
  event: HistoryEvent | null;
  onClose: () => void;
  onLocationFocus: (coord: { lat: number; lon: number }) => void;
};

/**
 * StoryDetailSheet — immersive view for story-level check-ins.
 *
 * Renders the check-in body with a letter-by-letter reveal driven by
 * `ReadingSpeedProvider` (no-op when the user has chosen "instant"). The sheet
 * takes more vertical space than `CheckInDetailSheet` — story posts are the
 * narrative payoff of a check-in and deserve room to breathe.
 *
 * Inline image blocks are deliberately out of scope for this part — they
 * require a `blocks` schema addition in `tripcast-backend` that is bundled
 * with the rest of the deferred backend mutations.
 */
export default function StoryDetailSheet({
  event,
  onClose,
  onLocationFocus,
}: StoryDetailSheetProps) {
  useEffect(() => {
    if (event?.lat !== undefined && event?.lon !== undefined) {
      onLocationFocus({ lat: event.lat, lon: event.lon });
    }
    // Focus map when story opens; onLocationFocus is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?._id]);

  return (
    <Sheet
      open={Boolean(event)}
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showBackdrop={false}
        className="z-[11] max-h-[78dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
        data-role="story-detail"
      >
        <SheetGrabber />
        {event ? <StoryBody key={event._id} event={event} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function StoryBody({ event }: { event: HistoryEvent }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2 px-5 pt-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <SheetKicker dotColor="var(--amber)">
            <Camera className="h-3 w-3" aria-hidden="true" />
            Story · {formatDate(event.occurredAt)} · {formatTime(event.occurredAt)}
          </SheetKicker>
          <SheetTitle className="font-[var(--font-display)] text-2xl font-extrabold leading-tight tracking-tight text-[var(--ink-1)]">
            {event.title ?? "Check-in"}
          </SheetTitle>
          {event.locationLabel ? (
            <p className="font-[var(--font-mono)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              {event.locationLabel}
            </p>
          ) : null}
        </div>
        <SheetCloseButton aria-label="Close story" />
      </div>

      <SheetBody
        className="px-5"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        {event.body ? (
          <RevealText
            text={event.body}
            className="block font-[var(--font-display)] text-[15px] leading-relaxed text-[var(--ink-1)]"
          />
        ) : (
          <p className="text-sm italic text-[var(--ink-3)]">No story body yet.</p>
        )}

        {event.statusNote ? (
          <blockquote className="mt-5 border-l-2 border-[var(--amber)] pl-4 text-sm italic text-[var(--ink-2)]">
            &ldquo;{event.statusNote}&rdquo;
          </blockquote>
        ) : null}
      </SheetBody>
    </>
  );
}

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetTitle,
} from "../../components/ui/sheet";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useActiveUiContext } from "../../debug/useActiveUiContext";

type Props = {
  token: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open the full-screen credits overlay. */
  onViewCredits: () => void;
};

const MAX_NOTE = 1000;

/**
 * Traveler-only End Trip control: write a thank-you note, end the trip (which
 * unlocks the credits finale), or reopen it. Ending never locks the app.
 */
export default function EndTripSheet({ token, open, onOpenChange, onViewCredits }: Props) {
  const credits = useQuery(tripcastApi.endTrip.getTripCredits, open ? { token } : "skip");
  const endTrip = useMutation(tripcastApi.endTrip.travelerEndTrip);
  const reopenTrip = useMutation(tripcastApi.endTrip.travelerReopenTrip);
  const log = useDebugLogger("EndTripSheet", "src/features/endtrip/EndTripSheet.tsx");

  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [populated, setPopulated] = useState(false);

  useActiveUiContext(open, {
    sheetName: "EndTripSheet",
    label: "End Trip",
    view: credits?.ended ? "ended" : "active",
    source: "options:end-trip",
    sourceLabel: "Options -> End Trip",
    file: "src/features/endtrip/EndTripSheet.tsx",
  });

  // Prefill the note once from the stored value.
  useEffect(() => {
    if (open && credits && !populated) {
      setNote(credits.thankYouNote ?? "");
      setPopulated(true);
    }
    if (!open && populated) setPopulated(false);
  }, [open, credits, populated]);

  async function handleEnd() {
    setWorking(true);
    setError(null);
    log.logMutation("endTrip:submit");
    try {
      await endTrip({ token, thankYouNote: note.trim() || undefined });
      log.logMutation("endTrip:submit:success");
      onOpenChange(false);
      onViewCredits();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not end the trip.");
    } finally {
      setWorking(false);
    }
  }

  async function handleReopen() {
    setWorking(true);
    setError(null);
    try {
      await reopenTrip({ token });
      log.logMutation("endTrip:reopen:success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reopen the trip.");
    } finally {
      setWorking(false);
    }
  }

  const ended = credits?.ended ?? false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-role="end-trip-sheet"
        className="max-h-[85dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
      >
        <div className="flex items-start justify-between gap-2 px-5 pt-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <SheetTitle className="font-[var(--font-display)] text-2xl font-extrabold tracking-tight text-[var(--ink-1)]">
              End Trip
            </SheetTitle>
          </div>
          <SheetCloseButton aria-label="Close End Trip" />
        </div>

        <SheetBody className="grid gap-4 px-5">
          <p className="text-sm text-[var(--ink-3)]">
            Ending the trip rolls the credits for everyone. It does not lock the
            app — you can keep posting, and reopen the trip any time.
          </p>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                Thank-you note
              </label>
              <span className="text-xs text-[var(--ink-3)]">
                {note.length}/{MAX_NOTE}
              </span>
            </div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
              rows={4}
              placeholder="A note to everyone who followed along…"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={working} onClick={handleEnd}>
              {working ? "Saving…" : ended ? "Update & roll credits" : "End trip & roll credits"}
            </Button>
            <Button type="button" variant="outline" onClick={onViewCredits}>
              View credits
            </Button>
            {ended && (
              <Button type="button" variant="outline" disabled={working} onClick={handleReopen}>
                Reopen trip
              </Button>
            )}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

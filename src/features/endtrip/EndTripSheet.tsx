import { useEffect, useState } from "react";
import { useTripMutation, useTripQuery } from "../../convex/useTrip";

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
import { setLiveSharingEnabled } from "../../lib/liveSharingPreference";
import { useOptionalTripContext } from "../../providers/TripContextProvider";
import { PrivateTripTargetLabel } from "../trips/privateTripView";
import { tripErrorInfo } from "../trips/tripSwitchState";
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
  const endTrip = useTripMutation(tripcastApi.endTrip.travelerEndTrip);
  const reopenTrip = useTripMutation(tripcastApi.endTrip.travelerReopenTrip);
  const { multiTripEnabled, viewingMode, currentTrip, reportTripUnavailable } = useOptionalTripContext();
  // The sheet stays mounted while closed: take the trip on screen each time it opens. Everything below (the credits
  // read, End Trip, Reopen) then names that trip explicitly, so a view change while it is open changes nothing.
  const target = endTrip.target;
  const recaptureEnd = endTrip.recapture;
  const recaptureReopen = reopenTrip.recapture;
  useEffect(() => {
    if (open) {
      recaptureEnd();
      recaptureReopen();
    }
  }, [open, recaptureEnd, recaptureReopen]);
  const credits = useTripQuery(
    tripcastApi.endTrip.getTripCredits,
    open ? { token, ...(target ? { tripId: target.tripId } : {}) } : "skip",
  );
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

  function reportIfTripGone(e: unknown) {
    if (target && tripErrorInfo(e).code === "trip_not_found") reportTripUnavailable?.(target.tripId);
  }

  async function handleEnd() {
    setWorking(true);
    setError(null);
    log.logMutation("endTrip:confirm", {
      ended,
      noteLength: note.trim().length,
    });
    log.logMutation("endTrip:submit");
    try {
      await endTrip({ token, thankYouNote: note.trim() || undefined });
      log.logMutation("endTrip:submit:success");
      // Ending the SHARED current trip stops this device's own live sharing (the server stops the others). Ending
      // a privately viewed trip that is not shared leaves sharing alone. Same local switch as the private banner's Stop.
      if (multiTripEnabled && target && target.tripId === currentTrip?.tripId) setLiveSharingEnabled(false);
      onOpenChange(false);
      onViewCredits();
    } catch (e) {
      reportIfTripGone(e);
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
      reportIfTripGone(e);
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
              Trip Complete
            </SheetTitle>
          </div>
          <SheetCloseButton aria-label="Close End Trip" />
        </div>

        <SheetBody className="grid gap-4 px-5">
          <PrivateTripTargetLabel target={target} />
          {multiTripEnabled && viewingMode !== "private" && target ? (
            <p className="text-xs text-[var(--ink-3)]">{target.title}</p>
          ) : null}
          <p className="text-sm text-[var(--ink-3)]">
            Ending the trip launches the finale for everyone and marks the trip as
            complete. Traveler controls stay available so the trip can be reopened.
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

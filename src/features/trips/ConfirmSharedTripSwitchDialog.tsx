import { useEffect, useRef, useState, type RefObject } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Info } from "lucide-react";
import { ErrorBoundary } from "react-error-boundary";

import { getLiveSharingEnabled } from "@/lib/liveSharingPreference";
import { useOnlineStatus } from "../../components/resilience/useOnlineStatus";
import { tripcastApi, type TripCard, type TripSwitchImpact } from "../../convex/tripcastApi";
import { useTripMutation, useTripQuery } from "../../convex/useTrip";
import { useTripContext } from "../../providers/TripContextProvider";
import {
  beginSwitch,
  endSwitch,
  STILL_WAITING_MESSAGE,
  SWITCH_SLOW_MS,
  tripErrorInfo,
  useSwitchRequest,
  useSwitchStalled,
} from "./tripSwitchState";

const OLD_APP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** The lines of the confirmation that apply to this switch, in the spec's wording. */
export function switchImpactLines(impact: TripSwitchImpact): string[] {
  const from = impact.fromTrip.title;
  const to = impact.toTrip.title;
  const lines = [`Followers will stop seeing ${from} and see ${to}.`];
  if (impact.isLive) {
    lines.push(`Live location sharing stops on all your devices. Turn it on again from ${to}.`);
  }
  const votes = impact.openRouteVoteCount;
  if (votes > 0 && impact.hasActiveActivity) {
    lines.push(`${votes} open ${votes === 1 ? "vote" : "votes"} and your current activity stay on ${from}.`);
  } else if (votes > 0) {
    lines.push(`${votes} open ${votes === 1 ? "vote stays" : "votes stay"} on ${from}.`);
  } else if (impact.hasActiveActivity) {
    lines.push(`Your current activity stays on ${from}.`);
  }
  if (impact.lastUntaggedIngestAt !== undefined && Date.now() - impact.lastUntaggedIngestAt < OLD_APP_WINDOW_MS) {
    lines.push("A device on an older TripCast app will stop sharing until it's updated.");
  }
  if (impact.toTrip.lifecycle === "completed") lines.push("Followers see its finished Story.");
  return lines;
}

export type ConfirmSharedTripSwitchDialogProps = {
  /** The card to show to Followers. Mount the dialog only while one is chosen: mounting is "opening". */
  card: TripCard;
  onClose: () => void;
  /** The server confirmed the switch. `liveWasOn` is whether live sharing was on when the Traveler confirmed. */
  onSwitched: (info: { liveWasOn: boolean }) => void;
  /** A message for the Traveler that outlives the dialog (cancelled while waiting, a late failure). */
  onNotice?: (message: string) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

/**
 * "Show <trip> to Followers?" confirmation. It loads `trips.getSwitchImpact` for the card and SNAPSHOTS the
 * revision once, when the dialog first has it: the query is live, but only the snapshot is ever sent (a conflict
 * takes a fresh one). Nothing is shown as switched until the server answers.
 */
export function ConfirmSharedTripSwitchDialog({
  card,
  onClose,
  onSwitched,
  onNotice,
  returnFocusRef,
}: ConfirmSharedTripSwitchDialogProps) {
  // `locked` keeps the dialog open while a request is in flight and not yet stalled (slow or offline).
  const [locked, setLocked] = useState(false);
  const title = `Show ${card.title} to Followers?`;

  return (
    <Dialog.Root open onOpenChange={(open) => (open || locked ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Backdrop data-sheet-nested-dialog="" className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" />
        <Dialog.Popup
          data-sheet-nested-dialog=""
          finalFocus={returnFocusRef}
          className="fixed left-1/2 top-1/2 z-[101] w-[calc(100%-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-5 shadow-xl"
        >
          <ErrorBoundary
            fallbackRender={() => (
              <>
                <Dialog.Title className="text-base font-bold text-[var(--ink-1)]">{title}</Dialog.Title>
                <p role="alert" className="mt-2 text-sm text-[var(--ink-danger)]">
                  This trip is no longer available.
                </p>
                <div className="mt-5 flex justify-end">
                  <Dialog.Close className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--ink-2)]">
                    Cancel
                  </Dialog.Close>
                </div>
              </>
            )}
          >
            <SwitchBody
              card={card}
              title={title}
              onClose={onClose}
              onSwitched={onSwitched}
              onNotice={onNotice}
              onLock={setLocked}
            />
          </ErrorBoundary>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type SwitchBodyProps = Pick<ConfirmSharedTripSwitchDialogProps, "card" | "onClose" | "onSwitched" | "onNotice"> & {
  title: string;
  onLock: (locked: boolean) => void;
};

function SwitchBody({ card, title, onClose, onSwitched, onNotice, onLock }: SwitchBodyProps) {
  const { token, currentTrip, returnToCurrent } = useTripContext();
  const impact = useTripQuery(tripcastApi.trips.getSwitchImpact, { token, tripId: card.tripId });
  const setCurrentTrip = useTripMutation(tripcastApi.trips.setCurrentTrip);
  const online = useOnlineStatus();
  const stalled = useSwitchStalled();

  // This dialog's own request (its token), and whether a DIFFERENT request is awaiting the server. Only one switch
  // may be in flight: while another is, this dialog cannot confirm.
  const request = useSwitchRequest();
  const [myToken, setMyToken] = useState<number | null>(null);
  const otherPending = request !== null && request.token !== myToken;

  // The revision confirmed against, taken once from the first impact seen (while no other switch is pending, since
  // that switch will move the revision). After a conflict `stale` holds the revision that was refused: the next
  // snapshot waits for the impact to move past it.
  const [snapshot, setSnapshot] = useState<number | null>(null);
  const [stale, setStale] = useState<number | null>(null);
  if (impact && snapshot === null && !otherPending && impact.expectedRevision !== stale) {
    setSnapshot(impact.expectedRevision);
  }

  const [sending, setSending] = useState(false);
  const [slow, setSlow] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const mounted = useRef(true);
  const settled = useRef(false);
  const inFlight = useRef(0);
  const sentRevision = useRef<number | null>(null);
  const liveWasOn = useRef(false);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestToken = useRef<number | null>(null);
  // Latest callbacks for a response that arrives after a re-render (or after the dialog was dismissed).
  const latest = useRef({ returnToCurrent, onSwitched, onNotice });
  useEffect(() => {
    latest.current = { returnToCurrent, onSwitched, onNotice };
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (slowTimer.current) clearTimeout(slowTimer.current);
      // Dismissed while the server has not answered: the switch can still land.
      if (requestToken.current !== null && !settled.current) {
        latest.current.onNotice?.("This switch may still complete.");
      }
    };
  }, []);

  useEffect(() => {
    onLock(sending && !slow && online);
  }, [sending, slow, online, onLock]);

  const stopWaiting = () => {
    if (slowTimer.current) clearTimeout(slowTimer.current);
    slowTimer.current = null;
  };

  // Only this dialog's own request is cleared, and a failure after the dialog is gone is reported as a notice.
  const fail = (error: unknown, ownToken: number) => {
    stopWaiting();
    endSwitch(ownToken);
    requestToken.current = null;
    const info = tripErrorInfo(error, "Could not switch trips. Try again.");
    if (!mounted.current) {
      const reason =
        info.code === "trip_revision_conflict"
          ? "Another device changed the shared trip."
          : info.code === "trip_not_found"
            ? "The trip was deleted or is no longer available."
            : info.message;
      latest.current.onNotice?.(`${card.title} was not shown to Followers. ${reason}`);
      return;
    }
    setSending(false);
    setSlow(false);
    if (info.code === "trip_revision_conflict") {
      setConflict(true);
      setMessage(null);
      setStale(sentRevision.current);
      setSnapshot(null);
    } else if (info.code === "trip_not_found") {
      setMessage("This trip was deleted or is no longer available.");
    } else {
      setMessage(info.message);
    }
  };

  const attempt = (revision: number, ownToken: number) => {
    inFlight.current += 1;
    setCurrentTrip({ token, tripId: card.tripId, expectedRevision: revision }).then(
      () => {
        inFlight.current -= 1;
        if (settled.current) return;
        settled.current = true;
        stopWaiting();
        endSwitch(ownToken);
        latest.current.returnToCurrent();
        latest.current.onSwitched({ liveWasOn: liveWasOn.current });
      },
      (error: unknown) => {
        inFlight.current -= 1;
        // A retry is still out: its answer decides.
        if (settled.current || inFlight.current > 0) return;
        fail(error, ownToken);
      },
    );
  };

  const confirm = () => {
    if (snapshot === null || sending || otherPending) return;
    liveWasOn.current = getLiveSharingEnabled();
    sentRevision.current = snapshot;
    settled.current = false;
    setMessage(null);
    setConflict(false);
    setSending(true);
    setSlow(false);
    const ownToken = beginSwitch(card.tripId);
    requestToken.current = ownToken;
    setMyToken(ownToken);
    stopWaiting();
    slowTimer.current = setTimeout(() => setSlow(true), SWITCH_SLOW_MS);
    attempt(snapshot, ownToken);
  };

  // Same revision as the first attempt, never a newer live value.
  const retry = () => {
    if (sentRevision.current === null || requestToken.current === null) return;
    attempt(sentRevision.current, requestToken.current);
  };

  const archived = impact?.toTrip.lifecycle === "archived";
  const sharedTitle = currentTrip?.title ?? impact?.fromTrip.title ?? "another trip";
  const canConfirm = snapshot !== null && online && !sending && !archived && !otherPending;

  return (
    <>
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--flag)]"
          style={{ background: "var(--bg-paper-2)" }}
        >
          <Info className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <Dialog.Title className="font-[var(--font-display)] text-base font-bold text-[var(--ink-1)]">
            {title}
          </Dialog.Title>
          {impact ? (
            <ul className="list-disc space-y-1 pl-4 text-sm text-[var(--ink-2)]">
              {switchImpactLines(impact).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p role="status" className="text-sm text-[var(--ink-3)]">
              Checking what will change…
            </p>
          )}
          {archived ? (
            <p role="alert" className="text-sm text-[var(--ink-danger)]">
              This trip is archived. Restore it first.
            </p>
          ) : null}
          {conflict ? (
            <p role="alert" className="text-sm text-[var(--ink-danger)]">
              Another device changed the shared trip to {sharedTitle}.
            </p>
          ) : null}
          {message ? (
            <p role="alert" className="text-sm text-[var(--ink-danger)]">
              {message}
            </p>
          ) : null}
          {!online ? <p className="text-sm text-[var(--ink-3)]">You're offline.</p> : null}
          {otherPending ? (
            <p role="status" className="text-sm text-[var(--ink-3)]">
              Another switch is still waiting for the server.
            </p>
          ) : null}
          {slow ? (
            <p role="status" className="text-sm text-[var(--ink-3)]">
              Waiting for server…
            </p>
          ) : null}
          {sending && stalled ? (
            <p role="status" className="text-sm text-[var(--ink-3)]">
              {STILL_WAITING_MESSAGE}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          disabled={sending && !slow && online}
          onClick={onClose}
          className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--meter-track)] disabled:opacity-50"
        >
          Cancel
        </button>
        {slow ? (
          <button
            type="button"
            disabled={!online}
            onClick={retry}
            className="rounded-full border border-[var(--line-soft)] px-4 py-2 text-sm font-semibold text-[var(--ink-1)] disabled:opacity-50"
          >
            Retry
          </button>
        ) : null}
        <button
          type="button"
          disabled={!canConfirm}
          onClick={confirm}
          className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--bg-paper)] transition-opacity disabled:opacity-50"
          style={{ background: "var(--flag)" }}
        >
          Show to Followers
        </button>
      </div>
    </>
  );
}

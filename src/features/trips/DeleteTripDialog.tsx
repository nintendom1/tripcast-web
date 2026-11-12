import { useEffect, useRef, useState, type RefObject } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { AlertTriangle } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useOnlineStatus } from "../../components/resilience/useOnlineStatus";
import { tripcastApi, type TripCard } from "../../convex/tripcastApi";
import { useTripMutation } from "../../convex/useTrip";
import { useTripContext } from "../../providers/TripContextProvider";
import { tripErrorInfo } from "./tripSwitchState";

/** Why `card` cannot be deleted, or `null` when it can. The server has the last word. */
export function deleteBlockedReason(card: TripCard, onlyTrip: boolean): string | null {
  if (card.isCurrent) return "Followers are viewing this trip. Show another trip to Followers first.";
  if (card.isLegacy) return "Your first trip cannot be deleted yet.";
  if (onlyTrip) return "You cannot delete your only trip.";
  return null;
}

export type DeleteTripDialogProps = {
  card: TripCard;
  /** The catalog holds no other trip. */
  onlyTrip?: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

/**
 * Typed-title confirmation for deleting a trip. The Traveler must type the exact title; deleting is unavailable
 * (with the reason) for the shared current trip, the only trip and the first trip. The call always names the
 * card's own `tripId`, never the viewed trip. Mount it only while open.
 */
export function DeleteTripDialog({ card, onlyTrip = false, onClose, returnFocusRef }: DeleteTripDialogProps) {
  const { token } = useTripContext();
  const deleteTrip = useTripMutation(tripcastApi.trips.deleteTrip);
  const online = useOnlineStatus();
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reason = deleteBlockedReason(card, onlyTrip);
  const canDelete = reason === null && typed === card.title && online && !deleting;

  const confirm = async () => {
    if (!canDelete) return;
    setDeleting(true);
    setServerError(null);
    try {
      await deleteTrip({ token, tripId: card.tripId });
      onClose();
    } catch (error) {
      if (!mounted.current) return;
      setServerError(tripErrorInfo(error, "Could not delete the trip. Try again.").message);
      setDeleting(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => (open || deleting ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Backdrop data-sheet-nested-dialog="" className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" />
        <Dialog.Popup
          data-sheet-nested-dialog=""
          initialFocus={reason === null ? inputRef : undefined}
          finalFocus={returnFocusRef}
          className="fixed left-1/2 top-1/2 z-[101] w-[calc(100%-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-5 shadow-xl"
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--ink-danger)]"
              style={{ background: "var(--bg-danger)" }}
            >
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <Dialog.Title className="font-[var(--font-display)] text-base font-bold text-[var(--ink-1)]">
                Delete {card.title}?
              </Dialog.Title>
              {reason ? (
                <Dialog.Description role="alert" className="text-sm text-[var(--ink-2)]">
                  {reason}
                </Dialog.Description>
              ) : (
                <>
                  <Dialog.Description className="text-sm text-[var(--ink-2)]">
                    This deletes the trip and everything in it. It can't be undone.
                  </Dialog.Description>
                  <label htmlFor={`delete-trip-${card.tripId}`} className="block text-xs font-semibold text-[var(--ink-2)]">
                    Type the trip title to confirm: {card.title}
                  </label>
                  <Input
                    id={`delete-trip-${card.tripId}`}
                    ref={inputRef}
                    value={typed}
                    autoComplete="off"
                    onChange={(e) => setTyped(e.target.value)}
                  />
                </>
              )}
              {!online ? <p className="text-xs text-[var(--ink-3)]">You're offline.</p> : null}
              {serverError ? (
                <p role="alert" className="text-sm text-[var(--ink-danger)]">
                  {serverError}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close
              disabled={deleting}
              className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--meter-track)]"
            >
              Cancel
            </Dialog.Close>
            <button
              type="button"
              disabled={!canDelete}
              onClick={() => void confirm()}
              className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--bg-paper)] transition-opacity disabled:opacity-50"
              style={{ background: "var(--ink-danger)" }}
            >
              {deleting ? "Deleting…" : "Delete trip"}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

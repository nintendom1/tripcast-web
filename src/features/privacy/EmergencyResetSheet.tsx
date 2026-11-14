import { useState } from "react";
import { useMutation } from "convex/react";
import { LogOut, ShieldAlert } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import {
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { TERMS } from "../../copy/terminology";
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import { eraseAllApplies } from "./eraseAllTrips";
import { useOptionalTripContext } from "../../providers/TripContextProvider";

type EmergencyResetSheetProps = {
  open: boolean;
  token: string;
  onOpenChange: (open: boolean) => void;
  onLoggedOut: () => void;
  onLocationDataCleared: () => void;
  onTripDataDeleted: () => void;
  onResetStarted: (message: string) => void;
};

export type EmergencyResetContentProps = Omit<
  EmergencyResetSheetProps,
  "open" | "onOpenChange"
> & {
  onClose: () => void;
  onPendingChange?: (isPending: boolean) => void;
};

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("too many") || message.toLowerCase().includes("rate")) {
    return "Too many emergency reset actions. Try again later.";
  }
  if (message.toLowerCase().includes("traveler")) {
    return "Traveler access is required for emergency reset.";
  }
  return message || "Emergency reset failed.";
}

/** The phrase the Traveler must type (multi-trip on) before all trips are erased. */
export const ERASE_ALL_PHRASE = "ERASE ALL TRIPS";

function successMessage(includeAuthSessions: boolean, eraseAll: boolean) {
  if (eraseAll) {
    return includeAuthSessions
      ? "Erasing all trips. Everyone will also be logged off."
      : "Erasing all trips. One new empty trip will be shared.";
  }
  if (includeAuthSessions) {
    return "Shared trip data deletion started. Everyone will also be logged off.";
  }
  return "Shared trip data deletion started.";
}

/** What this action does, in plain words: it is the whole-account reset, never one trip. */
function EraseAllTripsSummary({ className }: { className?: string }) {
  return (
    <div data-testid="erase-all-trips-summary" className={["grid gap-1", className].filter(Boolean).join(" ")}>
      <p className="text-sm font-semibold text-[var(--ink-danger)]">Erase ALL trips</p>
      <ul className="list-disc pl-5 text-sm text-[var(--ink-2)]">
        <li>Removes every trip, not just the one you are viewing.</li>
        <li>Leaves one new empty trip, which becomes the trip Followers see.</li>
        <li>Keeps accounts and cloaking pins.</li>
        <li>Stops live sharing.</li>
      </ul>
    </div>
  );
}

export default function EmergencyResetSheet({
  open,
  token,
  onOpenChange,
  onLoggedOut,
  onLocationDataCleared,
  onTripDataDeleted,
  onResetStarted,
}: EmergencyResetSheetProps) {
  const [isPending, setIsPending] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isPending) return;
    onOpenChange(nextOpen);
  }

  function handleContentClose() {
    setIsPending(false);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[88dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-sheet)]"
        data-role="emergency-reset-sheet"
      >
        <EmergencyResetContent
          token={token}
          onClose={handleContentClose}
          onLoggedOut={onLoggedOut}
          onLocationDataCleared={onLocationDataCleared}
          onTripDataDeleted={onTripDataDeleted}
          onResetStarted={onResetStarted}
          onPendingChange={setIsPending}
        />
      </SheetContent>
    </Sheet>
  );
}

export function EmergencyResetContent({
  token,
  onClose,
  onLoggedOut,
  onLocationDataCleared,
  onTripDataDeleted,
  onResetStarted,
  onPendingChange,
}: EmergencyResetContentProps) {
  // Not trip-scoped: it erases every trip, so it stays a plain mutation (no `tripId`).
  const emergencyReset = useMutation(tripcastApi.privacy.emergencyReset);
  const { returnToCurrent, multiTripEnabled, role, serverTripStatus = "known" } = useOptionalTripContext();
  // With multi-trip on, or while a Traveler's trip status is not known (loading, or failing: the flag then reads false),
  // this is "Erase ALL trips" and needs the phrase typed. Only a known-disabled state and no provider keep today's reset.
  const eraseAll = eraseAllApplies(multiTripEnabled, role, serverTripStatus);
  const [typed, setTyped] = useState("");
  const phraseOk = !eraseAll || typed.trim() === ERASE_ALL_PHRASE;

  const [includeAuthSessions, setIncludeAuthSessions] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useActiveUiContext(true, {
    sheetName: "EmergencyResetSheet",
    label: TERMS.emergencyReset,
    view: isConfirming ? "confirm" : "overview",
    source: "options:emergency-reset",
    sourceLabel: "Options -> Emergency Reset",
    file: "src/features/privacy/EmergencyResetSheet.tsx",
  }, { boundsSelector: "[data-role='options-sheet']" });

  function setPending(nextPending: boolean) {
    setIsPending(nextPending);
    onPendingChange?.(nextPending);
  }

  function handleClose() {
    if (isPending) return;
    setIsConfirming(false);
    setTyped("");
    setError(null);
    onClose();
  }

  async function runEmergencyReset() {
    if (isPending || !phraseOk) return;

    setPending(true);
    setError(null);

    try {
      await emergencyReset({ token, includeAuthSessions });
      // Every trip is gone, including one this device may be viewing privately: go back to following the shared trip.
      returnToCurrent();
      setIsConfirming(false);
      setTyped("");
      onLocationDataCleared();
      onTripDataDeleted();
      onResetStarted(successMessage(includeAuthSessions, eraseAll));
      setError(null);
      setPending(false);
      onClose();

      if (includeAuthSessions) {
        onLoggedOut();
      }
    } catch (actionError) {
      setError(friendlyError(actionError));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
        <SheetHeader className="text-[var(--ink-1)]">
          <SheetTitle className="text-[var(--ink-1)]">{eraseAll ? "Erase ALL trips" : TERMS.emergencyReset}</SheetTitle>
          <SheetDescription className="text-[var(--ink-3)]">
            {eraseAll
              ? "Traveler-only privacy controls that affect every trip, not just the one you are viewing."
              : "Traveler-only privacy controls."}
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 overflow-y-auto p-4 pt-0">
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-[var(--ink-danger)] bg-[var(--bg-danger)] px-3 py-2 text-sm text-[var(--ink-danger)]"
            >
              {error}
            </p>
          ) : null}

          {isConfirming ? (
            <div className="grid gap-4">
              <div className="rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] p-3">
                <h3 className="text-sm font-semibold text-[var(--ink-1)]">
                  {eraseAll ? "Confirm erasing every trip" : "Emergency Reset"}
                </h3>
                <p className="mt-1 text-sm text-[var(--ink-2)]">
                  {eraseAll ? "This will delete shared trip data for every trip" : "This will delete shared trip data"}, including checkpoints, live location,
                  route votes, Mystery Missions, traveler state, current activity, and journal entries.
                </p>
                {eraseAll ? <EraseAllTripsSummary className="mt-2" /> : null}
                {includeAuthSessions ? (
                  <p className="mt-2 text-sm text-[var(--ink-2)]">
                    Every active TripCast session will also be revoked.
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-[var(--ink-2)]">
                    Active TripCast sessions will stay signed in.
                  </p>
                )}
              </div>

              {includeAuthSessions ? (
                <div className="grid gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 text-sm text-[var(--ink-1)]">
                  <p className="font-medium text-[var(--ink-1)]">Before sharing new passcodes:</p>
                  <p className="text-[var(--ink-2)]">
                    Update <code>TRIPCAST_TRAVELER_CODE</code> and unset{" "}
                    <code>TRIPCAST_SUPPORT_CODE</code> in the Convex deployment environment.
                  </p>
                  <p className="text-[var(--ink-2)]">
                    Changing passcodes only affects future sign-ins. To invalidate old
                    sessions without this button, bump <code>TRIPCAST_AUTH_VERSION</code>.
                  </p>
                </div>
              ) : null}

              {eraseAll ? (
                <label className="grid gap-1 text-sm font-medium text-[var(--ink-1)]">
                  Type {ERASE_ALL_PHRASE} to confirm
                  <input
                    type="text"
                    value={typed}
                    disabled={isPending}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setTyped(event.target.value)}
                    className="rounded-md border border-[var(--line-soft)] bg-[var(--bg-paper)] px-3 py-2 text-sm font-normal text-[var(--ink-1)]"
                  />
                </label>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button
                  disabled={isPending}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsConfirming(false);
                    setTyped("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  disabled={isPending || !phraseOk}
                  type="button"
                  variant="outline"
                  className="border-[var(--ink-danger)] bg-[var(--bg-danger)] text-[var(--ink-danger)] hover:bg-[var(--bg-danger)] hover:text-[var(--ink-danger)] hover:opacity-90"
                  onClick={runEmergencyReset}
                >
                  {isPending ? "Working..." : eraseAll ? "Erase ALL trips" : "Confirm shared data deletion"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="grid grid-cols-[auto_1fr] items-start gap-3 px-1">
                <ShieldAlert className="mt-0.5 h-4 w-4 text-[var(--ink-danger)]" aria-hidden="true" />
                <div className="grid gap-1">
                  <h3 className="text-sm font-semibold text-[var(--ink-1)]">
                    {eraseAll ? "Delete the data of every trip" : "Delete Shared Trip Data"}
                  </h3>
                  <p className="text-sm text-[var(--ink-2)]">
                    Remove checkpoints, live location, route votes, Mystery Missions, traveler state,
                    current activity, and journal entries in one reset request. Sessions are
                    only revoked when selected below.
                  </p>
                  {eraseAll ? <EraseAllTripsSummary className="mt-1" /> : null}
                </div>
              </div>

              <label className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 text-sm text-[var(--ink-1)]">
                <input
                  checked={includeAuthSessions}
                  className="mt-1 h-4 w-4"
                  disabled={isPending}
                  style={{ accentColor: "var(--ink-danger)" }}
                  type="checkbox"
                  onChange={(event) => setIncludeAuthSessions(event.currentTarget.checked)}
                />
                <span className="grid gap-1">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Log everyone off too
                  </span>
                  <span className="text-[var(--ink-2)]">
                    Revoke every active TripCast session, including this traveler session.
                  </span>
                </span>
              </label>

              <div className="flex justify-end">
                <Button
                  disabled={isPending}
                  type="button"
                  variant="outline"
                  className="border-[var(--ink-danger)] bg-[var(--bg-danger)] text-[var(--ink-danger)] hover:bg-[var(--bg-danger)] hover:text-[var(--ink-danger)] hover:opacity-90"
                  onClick={() => {
                    setIsConfirming(true);
                    setError(null);
                  }}
                >
                  {eraseAll ? "Erase ALL trips" : "Delete Shared Trip Data"}
                </Button>
              </div>
            </div>
          )}
        </div>
    </>
  );
}

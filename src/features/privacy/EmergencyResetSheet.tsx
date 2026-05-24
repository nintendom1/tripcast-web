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
import { cn } from "@/lib/utils";

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

function successMessage(includeAuthSessions: boolean) {
  if (includeAuthSessions) {
    return "Shared trip data deletion started. Everyone will also be logged off.";
  }
  return "Shared trip data deletion started.";
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
  const emergencyReset = useMutation(tripcastApi.privacy.emergencyReset);

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
    setError(null);
    onClose();
  }

  async function runEmergencyReset() {
    if (isPending) return;

    setPending(true);
    setError(null);

    try {
      await emergencyReset({ token, includeAuthSessions });
      setIsConfirming(false);
      onLocationDataCleared();
      onTripDataDeleted();
      onResetStarted(successMessage(includeAuthSessions));
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
        <SheetHeader>
          <SheetTitle>{TERMS.emergencyReset}</SheetTitle>
          <SheetDescription>
            Traveler-only privacy controls.
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 overflow-y-auto p-4 pt-0">
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          {isConfirming ? (
            <div className="grid gap-4">
              <div className="rounded-md border bg-muted/40 p-3">
                <h3 className="text-sm font-semibold">Emergency Reset</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  This will delete shared trip data, including checkpoints, live location,
                  route votes, traveler state, current activity, and journal entries.
                </p>
                {includeAuthSessions ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Every active TripCast session will also be revoked.
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Active TripCast sessions will stay signed in.
                  </p>
                )}
              </div>

              {includeAuthSessions ? (
                <div className="grid gap-2 rounded-md border p-3 text-sm">
                  <p className="font-medium">Before sharing new passcodes:</p>
                  <p className="text-muted-foreground">
                    Update <code>TRIPCAST_TRAVELER_CODE</code> and{" "}
                    <code>TRIPCAST_SUPPORT_CODE</code> in the Convex deployment
                    environment.
                  </p>
                  <p className="text-muted-foreground">
                    Changing passcodes only affects future sign-ins. To invalidate old
                    sessions without this button, bump <code>TRIPCAST_AUTH_VERSION</code>.
                  </p>
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button
                  disabled={isPending}
                  type="button"
                  variant="outline"
                  onClick={() => setIsConfirming(false)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={isPending}
                  type="button"
                  variant="outline"
                  className="border-rose-300 bg-rose-50 text-rose-950 hover:bg-rose-100 hover:text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100 dark:hover:bg-rose-950/60"
                  onClick={runEmergencyReset}
                >
                  {isPending ? "Working..." : "Confirm shared data deletion"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="grid grid-cols-[auto_1fr] items-start gap-3 px-1">
                <ShieldAlert className="mt-0.5 h-4 w-4 text-rose-700 dark:text-rose-300" aria-hidden="true" />
                <div className="grid gap-1">
                  <h3 className="text-sm font-semibold">Delete Shared Trip Data</h3>
                  <p className="text-sm text-muted-foreground">
                    Remove checkpoints, live location, route votes, traveler state,
                    current activity, and journal entries in one reset request. Sessions are
                    only revoked when selected below.
                  </p>
                </div>
              </div>

              <label className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-md border p-3 text-sm">
                <input
                  checked={includeAuthSessions}
                  className="mt-1 h-4 w-4 accent-rose-700 dark:accent-rose-400"
                  disabled={isPending}
                  type="checkbox"
                  onChange={(event) => setIncludeAuthSessions(event.currentTarget.checked)}
                />
                <span className="grid gap-1">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Log everyone off too
                  </span>
                  <span className="text-muted-foreground">
                    Revoke every active TripCast session, including this traveler session.
                  </span>
                </span>
              </label>

              <div className="flex justify-end">
                <Button
                  disabled={isPending}
                  type="button"
                  variant="outline"
                  className="border-rose-300 bg-rose-50 text-rose-950 hover:bg-rose-100 hover:text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100 dark:hover:bg-rose-950/60"
                  onClick={() => {
                    setIsConfirming(true);
                    setError(null);
                  }}
                >
                  Delete Shared Trip Data
                </Button>
              </div>
            </div>
          )}
        </div>
    </>
  );
}

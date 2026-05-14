import { useState } from "react";
import { useMutation } from "convex/react";
import { Activity, LogOut, MapPinOff, ShieldAlert, Trash2 } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";

type EmergencyResetSheetProps = {
  open: boolean;
  token: string;
  onOpenChange: (open: boolean) => void;
  onLoggedOut: () => void;
  onLocationDataCleared: () => void;
  onTripDataDeleted: () => void;
};

type ResetAction = "checkpoints" | "location" | "tripData" | "sessions" | "travelerState" | "currentActivity";

type ActionConfig = {
  id: ResetAction;
  title: string;
  description: string;
  confirmLabel: string;
  icon: typeof Trash2;
};

const ACTIONS: ActionConfig[] = [
  {
    id: "checkpoints",
    title: "Delete Checkpoints",
    description: "Remove every saved map pin for traveler and support crew views.",
    confirmLabel: "Delete checkpoints",
    icon: Trash2,
  },
  {
    id: "location",
    title: "Clear Live Location",
    description: "Remove the last shared traveler location stored on the server.",
    confirmLabel: "Clear live location",
    icon: MapPinOff,
  },
  {
    id: "tripData",
    title: "Delete All Trip Data",
    description: "Remove checkpoints, live location, route votes, submissions, and challenges.",
    confirmLabel: "Delete all trip data",
    icon: ShieldAlert,
  },
  {
    id: "sessions",
    title: "Log Everyone Off",
    description: "Revoke every active TripCast session, including this traveler session.",
    confirmLabel: "Log everyone off",
    icon: LogOut,
  },
  {
    id: "travelerState",
    title: "Delete Traveler State",
    description: "Remove current state, visibility settings, and state history so Support Crew can no longer see traveler condition data.",
    confirmLabel: "Delete traveler state",
    icon: Activity,
  },
  {
    id: "currentActivity",
    title: "Clear Current Activity",
    description: "Remove the active current activity so Support Crew can no longer see what you are doing.",
    confirmLabel: "Clear current activity",
    icon: MapPinOff,
  },
];

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

function successMessage(action: ResetAction) {
  switch (action) {
    case "checkpoints":
      return "Checkpoint deletion started. Pins will disappear as the reset completes.";
    case "location":
      return "Live location has been cleared.";
    case "tripData":
      return "Trip data deletion started. Shared trip data will disappear as the reset completes.";
    case "sessions":
      return "Everyone has been logged off.";
    case "travelerState":
      return "Traveler State deletion started. State data will disappear as the reset completes.";
    case "currentActivity":
      return "Current activity cleared.";
  }
}

export default function EmergencyResetSheet({
  open,
  token,
  onOpenChange,
  onLoggedOut,
  onLocationDataCleared,
  onTripDataDeleted,
}: EmergencyResetSheetProps) {
  const deleteAllCheckpoints = useMutation(tripcastApi.privacy.deleteAllCheckpoints);
  const clearTravelerLocation = useMutation(tripcastApi.privacy.clearTravelerLocation);
  const deleteAllTripData = useMutation(tripcastApi.privacy.deleteAllTripData);
  const logEveryoneOff = useMutation(tripcastApi.privacy.logEveryoneOff);
  const deleteTravelerState = useMutation(tripcastApi.privacy.deleteTravelerState);
  const deleteCurrentActivity = useMutation(tripcastApi.privacy.deleteCurrentActivity);

  const [confirmAction, setConfirmAction] = useState<ActionConfig | null>(null);
  const [pendingAction, setPendingAction] = useState<ResetAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && pendingAction) return;
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setConfirmAction(null);
      setError(null);
      setStatus(null);
    }
  }

  async function runAction(action: ActionConfig) {
    if (pendingAction) return;

    setPendingAction(action.id);
    setError(null);
    setStatus(null);

    try {
      if (action.id === "checkpoints") {
        await deleteAllCheckpoints({ token });
      } else if (action.id === "location") {
        await clearTravelerLocation({ token });
      } else if (action.id === "tripData") {
        await deleteAllTripData({ token });
      } else if (action.id === "travelerState") {
        await deleteTravelerState({ token });
      } else if (action.id === "currentActivity") {
        await deleteCurrentActivity({ token });
      } else {
        await logEveryoneOff({ token });
      }

      setStatus(successMessage(action.id));
      setConfirmAction(null);

      if (action.id === "location" || action.id === "tripData") {
        onLocationDataCleared();
      }

      if (action.id === "tripData") {
        onTripDataDeleted();
      }

      if (action.id === "sessions") {
        onLoggedOut();
      }
    } catch (actionError) {
      setError(friendlyError(actionError));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Emergency Reset</SheetTitle>
          <SheetDescription>
            Traveler-only privacy controls.
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 overflow-y-auto p-4 pt-0">
          {status ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {status}
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          {confirmAction ? (
            <div className="grid gap-4">
              <div className="rounded-md border bg-muted/40 p-3">
                <h3 className="text-sm font-semibold">{confirmAction.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {confirmAction.description}
                </p>
              </div>

              {confirmAction.id === "sessions" ? (
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
                  disabled={pendingAction !== null}
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmAction(null)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={pendingAction !== null}
                  type="button"
                  variant="destructive"
                  onClick={() => runAction(confirmAction)}
                >
                  {pendingAction === confirmAction.id ? "Working..." : confirmAction.confirmLabel}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-md border bg-background p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                    disabled={pendingAction !== null}
                    type="button"
                    onClick={() => {
                      setConfirmAction(action);
                      setError(null);
                      setStatus(null);
                    }}
                  >
                    <Icon className="mt-0.5 h-4 w-4 text-destructive" aria-hidden="true" />
                    <span className="grid gap-1">
                      <span className="text-sm font-semibold">{action.title}</span>
                      <span className="text-sm text-muted-foreground">{action.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

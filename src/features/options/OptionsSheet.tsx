import { LogOut, ShieldAlert, UserPlus, Users } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { Button } from "../../components/ui/button";
import type { StoredSession } from "../../lib/auth";
import CreateInviteControl from "../followers/CreateInviteControl";

type OptionsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: StoredSession;
  role: "traveler" | "support_crew";
  onSignOut: () => void;
  onEmergencyReset: () => void;
  onManageFollowers: () => void;
};

export default function OptionsSheet({
  open,
  onOpenChange,
  session,
  role,
  onSignOut,
  onEmergencyReset,
  onManageFollowers,
}: OptionsSheetProps) {
  function handleSignOut() {
    onOpenChange(false);
    onSignOut();
  }

  function handleEmergencyReset() {
    onOpenChange(false);
    onEmergencyReset();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Options</SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto p-4 pt-0 flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Account
            </h3>
            {session.displayName ? (
              <p className="text-sm text-muted-foreground">
                Signed in as{" "}
                <span className="font-medium text-foreground">{session.displayName}</span>
              </p>
            ) : session.username ? (
              <p className="text-sm text-muted-foreground">
                Signed in as{" "}
                <span className="font-medium text-foreground">@{session.username}</span>
              </p>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={handleSignOut}
              className="w-fit"
            >
              <LogOut className="h-4 w-4 mr-1.5" aria-hidden />
              Sign out
            </Button>
          </section>

          {role === "traveler" ? (
            <section className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Followers
              </h3>
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" aria-hidden />
                  Create Invite
                </p>
                <CreateInviteControl token={session.token} />
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={onManageFollowers}
                className="w-fit"
              >
                <Users className="h-4 w-4 mr-1.5" aria-hidden />
                Manage Followers
              </Button>
            </section>
          ) : null}

          {role === "traveler" ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Danger Zone
              </h3>
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="border-rose-300 bg-rose-50 text-rose-950 hover:bg-rose-100 hover:text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100 dark:hover:bg-rose-950/60 w-fit"
                onClick={handleEmergencyReset}
              >
                <ShieldAlert
                  className="h-4 w-4 text-rose-700 dark:text-rose-300 mr-1.5"
                  aria-hidden
                />
                Emergency Reset
              </Button>
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { LogOut, ShieldAlert, UserPlus, Users } from "lucide-react";
import { tripcastApi } from "../../convex/tripcastApi";
import type { ChallengeModerationMode, ChallengeRateLimitPreset } from "../../convex/tripcastApi";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { Button } from "../../components/ui/button";
import type { StoredSession } from "../../lib/auth";
import CreateInviteControl from "../followers/CreateInviteControl";
import { EmergencyResetContent } from "../privacy/EmergencyResetSheet";

type OptionsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: StoredSession;
  role: "traveler" | "support_crew";
  onSignOut: () => void;
  onManageFollowers: () => void;
  onLoggedOut: () => void;
  onLocationDataCleared: () => void;
  onTripDataDeleted: () => void;
  onResetStarted: (message: string) => void;
};

type OptionsView = "options" | "emergency-reset";

// ---------------------------------------------------------------------------
// Challenge settings inline section
// ---------------------------------------------------------------------------

const MODERATION_OPTIONS: { value: ChallengeModerationMode; label: string; desc: string }[] = [
  { value: "manual_review", label: "Manual review", desc: "You approve each challenge before it's visible." },
  { value: "auto_publish", label: "Auto-publish", desc: "Challenges appear immediately (rate limits still apply)." },
];

const RATE_LIMIT_OPTIONS: { value: ChallengeRateLimitPreset; label: string }[] = [
  { value: "off", label: "No per-follower limit" },
  { value: "per_second", label: "1 per second" },
  { value: "per_minute", label: "1 per minute" },
  { value: "per_hour", label: "1 per hour" },
  { value: "per_day", label: "1 per day" },
];

function ChallengeSettingsSection({ token }: { token: string }) {
  const settings = useQuery(tripcastApi.challengeSettings.travelerGetChallengeSettings, { token });
  const updateSettings = useMutation(tripcastApi.challengeSettings.travelerUpdateChallengeSettings);
  const [error, setError] = useState<string | null>(null);

  async function handleModerationChange(mode: ChallengeModerationMode) {
    setError(null);
    try {
      await updateSettings({ token, moderationMode: mode });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRateLimitChange(preset: ChallengeRateLimitPreset) {
    setError(null);
    try {
      await updateSettings({ token, rateLimitPreset: preset });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const currentMode = settings?.moderationMode ?? "manual_review";
  const currentPreset = settings?.rateLimitPreset ?? "per_second";

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Challenges
      </h3>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-foreground">Proposal moderation</p>
        <div className="flex flex-col gap-1.5">
          {MODERATION_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="moderation-mode"
                value={opt.value}
                checked={currentMode === opt.value}
                onChange={() => handleModerationChange(opt.value)}
                className="mt-0.5"
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{opt.label}</span>
                <span className="text-xs text-muted-foreground">{opt.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-foreground">Per-follower proposal rate limit</p>
        <select
          value={currentPreset}
          onChange={(e) => handleRateLimitChange(e.target.value as ChallengeRateLimitPreset)}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
        >
          {RATE_LIMIT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">Hard cap: 300 proposals per trip per day regardless of setting.</p>
      </div>

      {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}
    </section>
  );
}

export default function OptionsSheet({
  open,
  onOpenChange,
  session,
  role,
  onSignOut,
  onManageFollowers,
  onLoggedOut,
  onLocationDataCleared,
  onTripDataDeleted,
  onResetStarted,
}: OptionsSheetProps) {
  const [view, setView] = useState<OptionsView>("options");
  const [isEmergencyResetPending, setIsEmergencyResetPending] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && view === "emergency-reset" && isEmergencyResetPending) return;
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setView("options");
      setIsEmergencyResetPending(false);
    }
  }

  function handleSignOut() {
    handleOpenChange(false);
    onSignOut();
  }

  function handleEmergencyReset() {
    setView("emergency-reset");
  }

  function handleEmergencyResetClose() {
    onOpenChange(false);
    setView("options");
    setIsEmergencyResetPending(false);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom">
        {view === "emergency-reset" ? (
          <EmergencyResetContent
            token={session.token}
            onClose={handleEmergencyResetClose}
            onLoggedOut={onLoggedOut}
            onLocationDataCleared={onLocationDataCleared}
            onTripDataDeleted={onTripDataDeleted}
            onResetStarted={onResetStarted}
            onPendingChange={setIsEmergencyResetPending}
          />
        ) : (
          <>
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
                <ChallengeSettingsSection token={session.token} />
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
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

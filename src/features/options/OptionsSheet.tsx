import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  BookOpen,
  Bug,
  ChevronRight,
  Clock,
  Database,
  Download,
  Eye,
  Flag,
  LogOut,
  Play,
  ShieldAlert,
  Trophy,
  User,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import DebugPanel from "../../debug/DebugPanel";
import type { DebugLogger } from "../../debug/useDebugLogger";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { logMapEvent } from "../../debug/debugLogger";
import { useActiveUiContext } from "../../debug/useActiveUiContext";

import { tripcastApi } from "../../convex/tripcastApi";
import type {
  MissionModerationMode,
  MissionRateLimitPreset,
} from "../../convex/tripcastApi";
import type { ReadingSpeed } from "../../providers/ReadingSpeedProvider";
import {
  Sheet,
  SheetBackButton,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetTitle,
} from "../../components/ui/sheet";
import { Button } from "../../components/ui/button";
import type { StoredSession } from "../../lib/auth";
import { cn } from "@/lib/utils";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useReadingSpeedSafe } from "../../providers/ReadingSpeedProvider";
import CreateInviteControl from "../followers/CreateInviteControl";
import { EmergencyResetContent } from "../privacy/EmergencyResetSheet";
import TravelFundsSheet from "../travelfunds/TravelFundsSheet";
import BulkImportSheet from "./BulkImportSheet";
import BulkExportSheet from "./BulkExportSheet";
import { TERMS } from "../../copy/terminology";
import { triggerMapCooldown } from "../map/mapService";

type OptionsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultView?: OptionsView;
  session: StoredSession;
  role: "traveler" | "follower";
  onSignOut: () => void;
  onManageFollowers: () => void;
  onReplayFollowerTour: () => void;
  onLoggedOut: () => void;
  onLocationDataCleared: () => void;
  onTripDataDeleted: () => void;
  onResetStarted: (message: string) => void;
  /** Traveler-only: open the End Trip flow (handled on the map). */
  onEndTrip?: () => void;
  /** Either role: open the full-screen trip credits. */
  onViewCredits?: () => void;
  preserveDebugContext?: boolean;
};

export type OptionsView = "options" | "emergency-reset" | "travel-funds" | "bulk-import" | "bulk-export" | "debug-logs";

const MODERATION_OPTIONS: { value: MissionModerationMode; label: string; desc: string }[] = [
  { value: "manual_review", label: "Manual review", desc: "You approve each mission before it is visible." },
  { value: "auto_publish", label: "Auto-publish", desc: "Follower proposals appear immediately." },
];

const RATE_LIMIT_OPTIONS: { value: MissionRateLimitPreset; label: string }[] = [
  { value: "off", label: "No per-follower limit" },
  { value: "per_second", label: "1 per second" },
  { value: "per_minute", label: "1 per minute" },
  { value: "per_hour", label: "1 per hour" },
  { value: "per_day", label: "1 per day" },
];

const SOUNDTRACK_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "idle", label: "Calm" },
  { value: "happy", label: "Happy" },
  { value: "morning", label: "Morning" },
  { value: "cafe", label: "Cafe" },
  { value: "story", label: "Story" },
  { value: "vote", label: "Vote" },
  { value: "mission", label: "Mission" },
] as const;

function detectBrowserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function TravelerTimezoneSection({ token }: { token: string }) {
  const preferences = useQuery(tripcastApi.travelerPreferences.travelerGetPreferences, {
    token,
  });
  const setTimeZone = useMutation(tripcastApi.travelerPreferences.travelerSetTimeZone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detectedTimeZone = detectBrowserTimeZone();
  const savedTimeZone = preferences?.travelerTimeZone ?? null;
  const timeZoneMismatch = Boolean(
    savedTimeZone && detectedTimeZone && savedTimeZone !== detectedTimeZone,
  );

  async function handleSetTimeZone() {
    if (!detectedTimeZone || saving) return;
    setSaving(true);
    setError(null);
    try {
      await setTimeZone({
        token,
        timeZone: detectedTimeZone,
        source: "device",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <OptionsSection label="Traveler Timezone">
      <div className="grid gap-3 rounded-xl bg-[var(--bg-card)] p-3">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--meter-track)] text-[var(--ink-2)]">
            <Clock className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--ink-1)]">Traveler timezone</p>
            <p className="text-xs text-[var(--ink-3)]">
              Based on this device's timezone settings.
            </p>
            <div className="mt-2 grid gap-1 text-xs text-[var(--ink-3)]">
              <span>Saved: {savedTimeZone ?? "Not set yet"}</span>
              {detectedTimeZone ? <span>This device: {detectedTimeZone}</span> : null}
            </div>
          </div>
        </div>

        {timeZoneMismatch && detectedTimeZone ? (
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={handleSetTimeZone}
            className="w-full"
          >
            {saving ? "Saving..." : `Set timezone to ${detectedTimeZone}`}
          </Button>
        ) : null}

        {error ? <p className="text-xs text-rose-600" role="alert">{error}</p> : null}
      </div>
    </OptionsSection>
  );
}

function MissionSettingsSection({ token }: { token: string }) {
  const settings = useQuery(tripcastApi.missionSettings.travelerGetMissionSettings, { token });
  const updateSettings = useMutation(tripcastApi.missionSettings.travelerUpdateMissionSettings);
  const [error, setError] = useState<string | null>(null);

  async function handleModerationChange(mode: MissionModerationMode) {
    setError(null);
    try {
      await updateSettings({ token, moderationMode: mode });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRateLimitChange(preset: MissionRateLimitPreset) {
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
    <OptionsSection label={TERMS.missions}>
      <div className="grid gap-2 rounded-xl bg-[var(--bg-card)] p-3">
        <p className="text-sm font-semibold text-[var(--ink-1)]">Proposal moderation</p>
        {MODERATION_OPTIONS.map((opt) => (
          <label key={opt.value} className="flex cursor-pointer items-start gap-2 text-sm text-[var(--ink-2)]">
            <input
              type="radio"
              name="moderation-mode"
              value={opt.value}
              checked={currentMode === opt.value}
              onChange={() => handleModerationChange(opt.value)}
              className="mt-1"
              style={{ accentColor: "var(--flag)" }}
            />
            <span>
              <span className="block font-semibold text-[var(--ink-1)]">{opt.label}</span>
              <span className="text-xs">{opt.desc}</span>
            </span>
          </label>
        ))}
      </div>

      <label className="grid gap-1.5 rounded-xl bg-[var(--bg-card)] p-3 text-sm font-semibold text-[var(--ink-1)]">
        Per-follower proposal rate limit
        <select
          value={currentPreset}
          onChange={(e) => handleRateLimitChange(e.target.value as MissionRateLimitPreset)}
          className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-1)]"
        >
          {RATE_LIMIT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <span className="text-xs font-normal text-[var(--ink-3)]">Hard cap: 300 proposals per trip per day.</span>
      </label>

      {error ? <p className="text-xs text-rose-600" role="alert">{error}</p> : null}
    </OptionsSection>
  );
}

function DeveloperScoringToggle({ token }: { token: string }) {
  const settings = useQuery(tripcastApi.scoring.travelerGetScoringSettings, { token });
  const setDeveloperScoring = useMutation(tripcastApi.scoring.travelerSetDeveloperScoring);
  const [error, setError] = useState<string | null>(null);
  const enabled = settings?.developerScoringEnabled ?? false;

  async function handleToggle() {
    setError(null);
    try {
      await setDeveloperScoring({ token, enabled: !enabled });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="grid gap-1.5 rounded-xl bg-[var(--bg-card)] p-3">
      <label className="flex cursor-pointer items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--meter-track)] text-[var(--ink-2)]">
          <Trophy className="h-4 w-4" aria-hidden />
        </div>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--ink-1)]">
            Earn Follower points as Traveler
          </span>
          <span className="block text-xs text-[var(--ink-3)]">
            Developer testing only. Lets the Traveler test achievement toasts and
            score UI.
          </span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleToggle}
          className="mt-1 h-4 w-4"
          style={{ accentColor: "var(--flag)" }}
        />
      </label>
      {error ? <p className="text-xs text-rose-600" role="alert">{error}</p> : null}
    </div>
  );
}

function FollowerAttributionToggle({ token }: { token: string }) {
  const settings = useQuery(tripcastApi.attributions.getMyAttributionSettings, { token });
  const setShowAttribution = useMutation(tripcastApi.attributions.setShowAttribution);
  const [error, setError] = useState<string | null>(null);
  const enabled = settings?.showAttribution ?? true;

  async function handleToggle() {
    setError(null);
    try {
      await setShowAttribution({ token, showAttribution: !enabled });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="grid gap-1.5 rounded-xl bg-[var(--bg-card)] p-3">
      <label className="flex cursor-pointer items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--meter-track)] text-[var(--ink-2)]">
          <Eye className="h-4 w-4" aria-hidden />
        </div>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--ink-1)]">
            Show my attribution
          </span>
          <span className="block text-xs text-[var(--ink-3)]">
            When off, your name is hidden from public Mission and Story credit, but you can still earn points.
          </span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleToggle}
          className="mt-1 h-4 w-4"
          style={{ accentColor: "var(--flag)" }}
        />
      </label>
      {error ? <p className="text-xs text-rose-600" role="alert">{error}</p> : null}
    </div>
  );
}

export default function OptionsSheet({
  open,
  onOpenChange,
  defaultView,
  session,
  role,
  onSignOut,
  onManageFollowers,
  onReplayFollowerTour,
  onLoggedOut,
  onLocationDataCleared,
  onTripDataDeleted,
  onResetStarted,
  onEndTrip,
  onViewCredits,
  preserveDebugContext = false,
}: OptionsSheetProps) {
  const [view, setView] = useState<OptionsView>("options");
  const [isEmergencyResetPending, setIsEmergencyResetPending] = useState(false);
  const music = useMusicSafe();
  const log = useDebugLogger("OptionsSheet", "src/features/options/OptionsSheet.tsx");
  useActiveUiContext(open, {
    sheetName: "OptionsSheet",
    label: "Options",
    view,
    source: "topbar:options",
    sourceLabel: "Options button",
    file: "src/features/options/OptionsSheet.tsx",
  }, {
    enabled: !preserveDebugContext,
    boundsSelector: "[data-role='options-sheet']",
  });

  useEffect(() => {
    log.logInteraction(open ? "sheet:open" : "sheet:close");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && defaultView && defaultView !== "options") {
      setView(defaultView);
    }
  }, [open, defaultView]);

  function navigateTo(next: OptionsView) {
    log.logInteraction("view:change", { from: view, to: next });
    setView(next);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && view === "emergency-reset" && isEmergencyResetPending) return;
    if (!nextOpen) log.logInteraction("sheet:close", { trigger: "backdrop" });
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setView("options");
      setIsEmergencyResetPending(false);
    }
  }

  function handleSignOut() {
    log.logUi("action:sign-out", { role });
    handleOpenChange(false);
    onSignOut();
  }

  function handleEmergencyResetClose() {
    onOpenChange(false);
    navigateTo("options");
    setIsEmergencyResetPending(false);
  }

  return (
    <>
      <Sheet open={open && view !== "bulk-import" && view !== "bulk-export"} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          data-role="options-sheet"
          className={cn(
            "max-h-[88dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]",
            view === "debug-logs" && "h-[88dvh] overflow-hidden",
          )}
        >
          {view === "travel-funds" ? (
            <SubViewHeader
              title={TERMS.travelFunds}
              onBack={() => { music.sfx("page"); navigateTo("options"); }}
            />
          ) : view === "emergency-reset" ? (
            <EmergencyResetContent
              token={session.token}
              onClose={handleEmergencyResetClose}
              onLoggedOut={onLoggedOut}
              onLocationDataCleared={onLocationDataCleared}
              onTripDataDeleted={onTripDataDeleted}
              onResetStarted={onResetStarted}
              onPendingChange={setIsEmergencyResetPending}
            />
          ) : view === "debug-logs" ? null : (
            <OptionsHomeHeader role={role} />
          )}

          {view === "travel-funds" ? (
            <SheetBody className="px-5">
              <TravelFundsSheet
                token={session.token}
                onClose={() => { music.sfx("page"); navigateTo("options"); }}
                debugSource={{ source: "options:travel-funds", sourceLabel: "Options -> Travel Funds" }}
              />
            </SheetBody>
          ) : view === "options" ? (
            <OptionsHome
              role={role}
              log={log}
              session={session}
              onSignOut={handleSignOut}
              onManageFollowers={onManageFollowers}
              onReplayFollowerTour={onReplayFollowerTour}
              onTravelFunds={() => { music.sfx("page"); navigateTo("travel-funds"); }}
              onBulkImport={() => { music.sfx("page"); navigateTo("bulk-import"); }}
              onBulkExport={() => { music.sfx("page"); navigateTo("bulk-export"); }}
              onEmergencyReset={() => { music.sfx("page"); navigateTo("emergency-reset"); }}
              onDebugLogs={() => { music.sfx("page"); navigateTo("debug-logs"); }}
              onEndTrip={onEndTrip ? () => { music.sfx("page"); handleOpenChange(false); onEndTrip(); } : undefined}
              onViewCredits={onViewCredits ? () => { music.sfx("page"); handleOpenChange(false); onViewCredits(); } : undefined}
            />
          ) : view === "debug-logs" ? (
            <SheetBody className="min-h-0 overflow-hidden p-0">
              <DebugPanel onBack={() => { music.sfx("page"); navigateTo("options"); }} />
            </SheetBody>
          ) : null}
        </SheetContent>
      </Sheet>

      {role === "traveler" ? (
        <BulkImportSheet
          open={open && view === "bulk-import"}
          token={session.token}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              music.sfx("page");
              navigateTo("options");
              onOpenChange(true);
            }
          }}
        />
      ) : null}

      {role === "traveler" && open && view === "bulk-export" ? (
        <BulkExportSheet
          open={true}
          token={session.token}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              music.sfx("page");
              navigateTo("options");
              onOpenChange(true);
            }
          }}
        />
      ) : null}
    </>
  );
}

function MapSettingsSection({ token, role }: { token: string; role: "traveler" | "follower" }) {
  const preferences = useQuery(tripcastApi.travelerPreferences.travelerGetPreferences, role === "traveler" ? { token } : "skip");
  const followerPreferences = useQuery(tripcastApi.travelerPreferences.followerGetPreferences, role === "follower" ? { token } : "skip");
  const updatePreferences = useMutation((tripcastApi.travelerPreferences as any).travelerUpdatePreferences);

  const [showTripPath, setShowTripPath] = useState(() => {
    const val = localStorage.getItem("tripcast.showTripPath");
    return val === null ? true : val === "true";
  });

  const toggleShowPath = (checked: boolean) => {
    setShowTripPath(checked);
    localStorage.setItem("tripcast.showTripPath", String(checked));
    window.dispatchEvent(new Event("tripcast.preferencesUpdated"));
  };

  const allowFollowers = role === "traveler"
    ? ((preferences as any)?.allowFollowersTripPath ?? false)
    : (followerPreferences?.visible ? (followerPreferences as any).allowFollowersTripPath : false);

  const toggleAllowFollowers = async (checked: boolean) => {
    await updatePreferences({ token, allowFollowersTripPath: checked });
  };

  return (
    <OptionsSection label="Map Settings">
      <div className="grid gap-2 rounded-xl bg-[var(--bg-card)] p-3">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[var(--ink-1)]">Show Trip Path</span>
            <span className="block text-xs text-[var(--ink-3)]">Draw a dashed line connecting your pins.</span>
          </span>
          <input type="checkbox" checked={showTripPath} onChange={(e) => toggleShowPath(e.target.checked)} className="h-4 w-4" style={{ accentColor: "var(--flag)" }} />
        </label>

        {role === "traveler" && (
          <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-[var(--line-soft)] pt-2 mt-1">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[var(--ink-1)]">Followers can see Trip Path</span>
              <span className="block text-xs text-[var(--ink-3)]">Allow Followers to see your chronological path.</span>
            </span>
            <input type="checkbox" checked={allowFollowers} onChange={(e) => toggleAllowFollowers(e.target.checked)} className="h-4 w-4" style={{ accentColor: "var(--flag)" }} />
          </label>
        )}
      </div>
    </OptionsSection>
  );
}

function OptionsHome({
  role,
  log,
  session,
  onSignOut,
  onManageFollowers,
  onReplayFollowerTour,
  onTravelFunds,
  onBulkImport,
  onBulkExport,
  onEmergencyReset,
  onDebugLogs,
  onEndTrip,
  onViewCredits,
}: {
  role: "traveler" | "follower";
  log: DebugLogger;
  session: StoredSession;
  onSignOut: () => void;
  onManageFollowers: () => void;
  onReplayFollowerTour: () => void;
  onTravelFunds: () => void;
  onDebugLogs: () => void;
  onBulkImport: () => void;
  onBulkExport: () => void;
  onEmergencyReset: () => void;
  onEndTrip?: () => void;
  onViewCredits?: () => void;
}) {
  return (
    <SheetBody className="grid gap-5 px-5">
      <SoundSection />
      <ReadingSection />

      <OptionsSection label="Account">
        <MapSettingsSection token={session.token} role={role} />

        <InfoRow
          icon={User}
          title={session.displayName ?? (session.username ? `@${session.username}` : "Signed in")}
          detail="Display name"
        />
        {role === "follower" ? <FollowerAttributionToggle token={session.token} /> : null}
        <OptionsRow 
          icon={LogOut} 
          title="Sign out" 
          onClick={() => {
            log.logUi("action:sign-out");
            onSignOut();
          }} 
        />
      </OptionsSection>

      {role === "traveler" ? (
        <>
        <OptionsSection label="Followers">
            <div className="rounded-xl bg-[var(--bg-card)] p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
                <UserPlus className="h-4 w-4" aria-hidden />
                Create Invite
              </p>
              <CreateInviteControl token={session.token} />
            </div>
            <OptionsRow 
              icon={Users} 
              title={TERMS.manageFollowers} 
              detail="Active and pending followers" 
              onClick={() => {
                log.logUi("action:manage-followers");
                onManageFollowers();
              }} 
            />
          </OptionsSection>

          <TravelerTimezoneSection token={session.token} />

          <OptionsSection label={TERMS.travelFunds}>
            <OptionsRow 
              icon={Wallet} 
              title={`Manage ${TERMS.travelFunds}`} 
              detail="Budget, pace, and transactions" 
              onClick={() => {
                log.logUi("action:manage-travel-funds");
                onTravelFunds();
              }} 
            />
          </OptionsSection>

          <MissionSettingsSection token={session.token} />

          <OptionsSection label="Data / Dev">
            <OptionsRow 
              icon={Database} 
              title="Bulk Import" 
              detail="Paste JSON to batch-add pins, funds, missions, and votes" 
              onClick={() => {
                log.logUi("action:bulk-import");
                onBulkImport();
              }} 
            />
            <OptionsRow 
              icon={Download} 
              title="Bulk Export" 
              detail="Export trip history as JSON compatible with Bulk Import" 
              onClick={() => {
                log.logUi("action:bulk-export");
                onBulkExport();
              }} 
            />
          </OptionsSection>

          <OptionsSection label="Tour">
            <OptionsRow 
              icon={Play} 
              title="Replay welcome tour" 
              detail="Preview the onboarding intro" 
              onClick={() => {
                log.logUi("action:replay-tour");
                onReplayFollowerTour();
              }} 
            />
          </OptionsSection>

          {onEndTrip || onViewCredits ? (
            <OptionsSection label="Finale">
              {onEndTrip ? (
                <OptionsRow 
                  icon={Flag} 
                  title="End Trip" 
                  detail="Roll the credits and leave a thank-you note" 
                  onClick={() => {
                    log.logUi("action:end-trip");
                    onEndTrip();
                  }} 
                />
              ) : null}
              {onViewCredits ? (
                <OptionsRow 
                  icon={Trophy} 
                  title="View trip credits" 
                  detail="Roll the finale reel" 
                  onClick={() => {
                    log.logUi("action:view-credits");
                    onViewCredits();
                  }} 
                />
              ) : null}
            </OptionsSection>
          ) : null}
        </>
      ) : (
        <OptionsSection label="Trip">
          <OptionsRow 
            icon={Play} 
            title="Replay welcome tour" 
            detail="See the onboarding intro again" 
            onClick={() => {
              log.logUi("action:replay-tour");
              onReplayFollowerTour();
            }} 
          />
          {onViewCredits ? (
            <OptionsRow 
              icon={Trophy} 
              title="View trip credits" 
              detail="Roll the finale reel" 
              onClick={() => {
                log.logUi("action:view-credits");
                onViewCredits();
              }} 
            />
          ) : null}
        </OptionsSection>
      )}

      <OptionsSection label="Developer">
        <OptionsRow icon={Bug} title={TERMS.debugLog} detail="Debug logging and session log export" onClick={onDebugLogs} />
        {role === "traveler" ? <DeveloperScoringToggle token={session.token} /> : null}
        <OptionsRow
          icon={ShieldAlert}
          title="Trigger Map Cooldown"
          detail="Simulate map service outage"
          danger
          onClick={() => {
            log.logUi("action:trigger-map-cooldown");
            const cooldown = triggerMapCooldown();
            logMapEvent("map:cooldown:manual-trigger", {
              cooldownUntil: cooldown.until,
              remainingMs: cooldown.until ? Math.max(0, cooldown.until - Date.now()) : 0,
              strikes: cooldown.strikes,
              backoffMs: cooldown.backoffMs,
              source: "options",
            });
          }}
        />
      </OptionsSection>

      {role === "traveler" ? (
        <OptionsSection label={TERMS.dangerZone}>
          <OptionsRow icon={ShieldAlert} title={TERMS.emergencyReset} detail="Wipe shared trip data" danger onClick={onEmergencyReset} />
        </OptionsSection>
      ) : null}

    </SheetBody>
  );
}

function OptionsHomeHeader({ role }: { role: "traveler" | "follower" }) {
  return (
    <div className="flex items-start justify-between gap-2 px-5 pt-2">
      <div className="flex min-w-0 flex-col gap-1.5">
        <SheetTitle className="font-[var(--font-display)] text-2xl font-extrabold tracking-tight text-[var(--ink-1)]">
          {TERMS.options}
        </SheetTitle>
      </div>
      <SheetCloseButton aria-label="Close options" />
    </div>
  );
}

function SubViewHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 px-5 pt-2">
      <div className="flex min-w-0 items-start gap-2">
        <SheetBackButton onClick={onBack} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <SheetTitle className="font-[var(--font-display)] text-2xl font-extrabold tracking-tight text-[var(--ink-1)]">
            {title}
          </SheetTitle>
        </div>
      </div>
      <SheetCloseButton aria-label={`Close ${title}`} />
    </div>
  );
}

function SoundSection() {
  const music = useMusicSafe();
  return (
    <OptionsSection label="Sound">
      <div className="grid gap-3 rounded-xl bg-[var(--bg-card)] p-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              music.sfx("tap");
              music.setMute(!music.mute);
            }}
            className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--meter-track)] text-[var(--ink-1)]"
            aria-label={music.mute ? "Unmute sound" : "Mute sound"}
          >
            {music.mute ? <VolumeX className="h-5 w-5" aria-hidden /> : <Volume2 className="h-5 w-5" aria-hidden />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--ink-1)]">{music.mute ? "Muted" : "Playing"}</p>
          </div>
        </div>
        <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Volume
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(music.volume * 100)}
            onChange={(event) => music.setVolume(Number(event.target.value) / 100)}
            style={{ accentColor: "var(--flag)" }}
            aria-label="Sound volume"
          />
        </label>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Soundtrack</p>
          <div className="grid grid-cols-4 gap-1.5">
            {SOUNDTRACK_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  music.sfx("tap");
                  music.setSoundtrack(option.value);
                }}
                className={cn(
                  "rounded-full px-2 py-1.5 text-xs font-semibold",
                  music.soundtrack === option.value
                    ? "bg-[var(--ink-1)] text-[var(--ink-on-dark)]"
                    : "bg-[var(--meter-track)] text-[var(--ink-2)]",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </OptionsSection>
  );
}

function ReadingSection() {
  const reading = useReadingSpeedSafe();
  return (
    <OptionsSection label="Story / Reading">
      <div className="grid gap-3 rounded-xl bg-[var(--bg-card)] p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-1)]">
          <BookOpen className="h-4 w-4" aria-hidden />
          Story text reveal speed
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {(["slow", "normal", "fast", "instant"] as ReadingSpeed[]).map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => reading.setSpeed(speed)}
              className={cn(
                "rounded-full px-2 py-1.5 text-xs font-semibold capitalize",
                reading.speed === speed
                  ? "bg-[var(--ink-1)] text-[var(--ink-on-dark)]"
                  : "bg-[var(--meter-track)] text-[var(--ink-2)]",
              )}
            >
              {speed}
            </button>
          ))}
        </div>
      </div>
    </OptionsSection>
  );
}

function OptionsSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]">
        {label}
      </h3>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

function InfoRow({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[var(--bg-card)] p-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--meter-track)] text-[var(--ink-2)]">
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--ink-1)]">{title}</p>
        {detail ? <p className="text-xs text-[var(--ink-3)]">{detail}</p> : null}
      </div>
    </div>
  );
}

function OptionsRow({
  icon: Icon,
  title,
  detail,
  danger = false,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  detail?: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl bg-[var(--bg-card)] p-3 text-left shadow-sm",
        danger && "bg-rose-50 text-rose-900",
      )}
    >
      <div
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--meter-track)] text-[var(--ink-2)]",
          danger && "bg-rose-100 text-rose-700",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold text-[var(--ink-1)]", danger && "text-rose-950")}>{title}</p>
        {detail ? <p className={cn("text-xs text-[var(--ink-3)]", danger && "text-rose-700")}>{detail}</p> : null}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden />
    </button>
  );
}

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useState, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);
import {
  BookOpen,
  Bomb,
  Bug,
  ChevronRight,
  Clock,
  Database,
  Download,
  Eye,
  EyeOff,
  Flag,
  LogOut,
  Play,
  RadioTower,
  Route,
  Shield,
  ShieldAlert,
  Trash2,
  Trophy,
  Moon,
  Sun,
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
import { useTheme } from "../../providers/ThemeProvider";
import { useActiveUiContext } from "../../debug/useActiveUiContext";

import { tripcastApi } from "../../convex/tripcastApi";
import type {
  CloakingPin,
  LiveTrailDeletePreview,
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
import MysteryMissionsSheet from "./MysteryMissionsSheet";
import { TERMS } from "../../copy/terminology";
import { triggerMapCooldown } from "../map/mapService";
import { triggerCrash } from "../../debug/crashTrigger";
import { getMapStyleResolution } from "../map/mapService";

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

export type OptionsView = "options" | "emergency-reset" | "travel-funds" | "live-trail" | "bulk-import" | "bulk-export" | "mystery-missions" | "debug-logs" | "cloaking-pins";

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

const optionsContentFrameClass = "mx-auto w-full max-w-[1024px] px-4 sm:px-8 lg:px-10";

function OptionsContentFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(optionsContentFrameClass, className)}>
      {children}
    </div>
  );
}

function detectBrowserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function formatDateInputValue(ms: number, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ms));
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fall back to UTC below.
  }
  return new Date(ms).toISOString().slice(0, 10);
}

function formatTimeInputValue(ms: number, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(ms));
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;
    if (hour && minute) return `${hour}:${minute}`;
  } catch {
    // Fall back to UTC below.
  }
  const date = new Date(ms);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function combineDateTime(date: string, time: string) {
  if (!date) return "";
  if (!time) return date;
  return `${date}T${time}`;
}

type LiveTrailPreviewSample = LiveTrailDeletePreview["samples"][number];

function PrivacyFollowersSection({ token }: { token: string }) {
  const preferences = useQuery(tripcastApi.travelerPreferences.travelerGetPreferences, { token });
  const updatePreferences = useMutation(tripcastApi.travelerPreferences.travelerUpdatePreferences);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cutoffAt = preferences?.followerContentCutoffAt;
  const timeZone = preferences?.travelerTimeZone ?? detectBrowserTimeZone() ?? "UTC";

  const [date, setDate] = useState(() => (cutoffAt ? formatDateInputValue(cutoffAt, timeZone) : ""));
  const [time, setTime] = useState(() => (cutoffAt ? formatTimeInputValue(cutoffAt, timeZone) : ""));

  // Update local state when preferences load
  useEffect(() => {
    if (cutoffAt) {
      setDate(formatDateInputValue(cutoffAt, timeZone));
      setTime(formatTimeInputValue(cutoffAt, timeZone));
    }
  }, [cutoffAt, timeZone]);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      let followerContentCutoffAt: number | null = null;
      if (date && time) {
        // Use the Traveler's saved timezone to parse the date/time string.
        // This ensures the timestamp is correct even if the viewer's browser
        // is in a different timezone.
        const dt = dayjs.tz(`${date}T${time}`, timeZone);
        followerContentCutoffAt = dt.valueOf();
      }

      await updatePreferences({ token, followerContentCutoffAt });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setError(null);
    setSaving(true);
    try {
      await updatePreferences({ token, followerContentCutoffAt: null });
      setDate("");
      setTime("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <OptionsSection label="Privacy and Followers">
      <OptionsGroup>
        <div className="grid gap-4 p-4 sm:p-5">
          <div className="flex items-start gap-4">
            <OptionsIcon icon={Shield} />
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-[var(--ink-1)]">Follower content cutoff</p>
              <p className="text-sm text-[var(--ink-3)]">
                Hide content older than this date/time from Followers.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <label
                htmlFor="cutoff-date"
                className="text-sm font-semibold text-[var(--ink-1)] text-xs uppercase tracking-wider opacity-70"
              >
                Cutoff Date
              </label>
              <input
                id="cutoff-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-1)]"
              />
            </div>
            <div className="grid gap-2">
              <label
                htmlFor="cutoff-time"
                className="text-sm font-semibold text-[var(--ink-1)] text-xs uppercase tracking-wider opacity-70"
              >
                Cutoff Time
              </label>
              <input
                id="cutoff-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-1)]"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving || !date || !time}
              onClick={handleSave}
              className="flex-1"
            >
              {saving ? "Saving..." : "Set Cutoff"}
            </Button>
            {cutoffAt ? (
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={handleClear}
                className="text-[var(--ink-danger)] hover:bg-[var(--bg-danger)]"
              >
                Clear
              </Button>
            ) : null}
          </div>

          {error ? (
            <p className="text-xs text-[var(--ink-danger)]" role="alert">
              {error}
            </p>
          ) : null}
          {cutoffAt ? (
            <p className="text-xs text-[var(--ink-3)]">
              Current cutoff: {new Date(cutoffAt).toLocaleString()}
            </p>
          ) : (
            <p className="text-xs text-[var(--ink-3)]">
              No cutoff set. All content is visible to Followers.
            </p>
          )}
        </div>
      </OptionsGroup>
    </OptionsSection>
  );
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
      <OptionsGroup>
        <div className="grid gap-4 p-4 sm:p-5">
          <div className="flex items-start gap-4">
            <OptionsIcon icon={Clock} />
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-[var(--ink-1)]">Traveler timezone</p>
              <p className="text-sm text-[var(--ink-3)]">
                Based on this device's timezone settings.
              </p>
              <div className="mt-2 grid gap-1 text-sm text-[var(--ink-3)]">
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
              className="w-full sm:w-fit"
            >
              {saving ? "Saving..." : `Set timezone to ${detectedTimeZone}`}
            </Button>
          ) : null}

          {error ? <p className="text-xs text-[var(--ink-danger)]" role="alert">{error}</p> : null}
        </div>
      </OptionsGroup>
    </OptionsSection>
  );
}

function AppearanceSection() {
  const theme = useTheme();
  const { mode, setMode, resolvedTheme } = theme;
  const autoEnabled = mode === "auto";

  function handleAutoChange(enabled: boolean) {
    setMode(enabled ? "auto" : resolvedTheme);
  }

  return (
    <OptionsSection label="Appearance">
      <OptionsGroup>
        <div className="grid gap-3 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("meadow")}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all",
                mode === "meadow"
                  ? "bg-[var(--ink-1)] text-[var(--bg-paper)] shadow-sm"
                  : "bg-[var(--meter-track)] text-[var(--ink-2)] hover:bg-[var(--bg-card)]",
              )}
            >
              <Sun className="h-4 w-4" aria-hidden />
              Light
            </button>
            <button
              type="button"
              onClick={() => setMode("constellation")}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all",
                mode === "constellation"
                  ? "bg-[var(--ink-1)] text-[var(--bg-paper)] shadow-sm"
                  : "bg-[var(--meter-track)] text-[var(--ink-2)] hover:bg-[var(--bg-card)]",
              )}
            >
              <Moon className="h-4 w-4" aria-hidden />
              Dark
            </button>
          </div>
        </div>
        <OptionsSwitchRow
          icon={Clock}
          title="Automatic theme"
          detail={`Currently using ${resolvedTheme === "meadow" ? "Light" : "Dark"} based on your local time.`}
          checked={autoEnabled}
          onChange={handleAutoChange}
        />
      </OptionsGroup>
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
      <OptionsGroup>
        <div className="grid gap-3 p-4 sm:p-5">
          <p className="text-base font-semibold text-[var(--ink-1)]">Proposal moderation</p>
          {MODERATION_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-start gap-3 text-sm text-[var(--ink-2)]">
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

        <label className="grid gap-2 p-4 text-sm font-semibold text-[var(--ink-1)] sm:p-5">
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
      </OptionsGroup>

      {error ? <p className="text-xs text-[var(--ink-danger)]" role="alert">{error}</p> : null}
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
    <div>
      <OptionsSwitchRow
        icon={Trophy}
        title="Earn Follower points as Traveler"
        detail="Developer testing only. Lets the Traveler test achievement toasts and score UI."
        checked={enabled}
        onChange={handleToggle}
      />
      {error ? <p className="text-xs text-[var(--ink-danger)]" role="alert">{error}</p> : null}
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
    <div>
      <OptionsSwitchRow
        icon={Eye}
        title="Show my attribution"
        detail="When off, your name is hidden from public Mission and Story credit, but you can still earn points."
        checked={enabled}
        onChange={handleToggle}
      />
      {error ? <p className="text-xs text-[var(--ink-danger)]" role="alert">{error}</p> : null}
    </div>
  );
}

function LiveTrailSettingsSheet({ token, log }: { token: string; log: DebugLogger }) {
  const fallbackTimeZone = detectBrowserTimeZone() ?? "UTC";
  const preferences = useQuery(tripcastApi.travelerPreferences.travelerGetPreferences, { token });
  const status = useQuery(tripcastApi.liveTrail.travelerGetLiveTrailStatus, { token });
  const setEnabled = useMutation(tripcastApi.liveTrail.travelerSetLiveTrailEnabled);
  const setVisibility = useMutation(tripcastApi.liveTrail.travelerSetLiveTrailVisibility);
  const deleteRange = useMutation(tripcastApi.liveTrail.travelerDeleteLiveTrailRange);

  const timeZone = preferences?.travelerTimeZone ?? fallbackTimeZone;
  const [startDate, setStartDate] = useState(() => formatDateInputValue(Date.now(), fallbackTimeZone));
  const [startTime, setStartTime] = useState(() => "00:00");
  const [endDate, setEndDate] = useState(() => formatDateInputValue(Date.now(), fallbackTimeZone));
  const [endTime, setEndTime] = useState(() => "23:59");
  const [savingField, setSavingField] = useState<"enabled" | "visibility" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const combinedStart = combineDateTime(startDate, startTime);
  const combinedEnd = combineDateTime(endDate, endTime);
  const rangeIsValid = Boolean(startDate && endDate && combinedStart <= combinedEnd);

  const preview = useQuery(
    tripcastApi.liveTrail.travelerPreviewLiveTrailDeleteRange,
    rangeIsValid ? { token, startDate: combinedStart, endDate: combinedEnd, timeZone } : "skip",
  );

  const enabled = status?.enabled ?? false;
  const visibleToFollowers = status?.visibleToFollowers ?? false;
  const previewCount = preview?.count ?? 0;

  useEffect(() => {
    log.logInteraction("live-trail:settings:open");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!rangeIsValid) return;
    log.logInteraction("live-trail:preview:request", {
      startDate: combinedStart,
      endDate: combinedEnd,
      timeZone,
    });
  }, [combinedEnd, combinedStart, log, rangeIsValid, timeZone]);

  function setQuickRange(minutes: number) {
    const now = Date.now();
    const startMs = now - minutes * 60 * 1000;
    setStartDate(formatDateInputValue(startMs, timeZone));
    setStartTime(formatTimeInputValue(startMs, timeZone));
    setEndDate(formatDateInputValue(now, timeZone));
    setEndTime(formatTimeInputValue(now, timeZone));
    log.logInteraction("live-trail:quick-range", { minutes });
  }

  async function handleEnabledChange(nextEnabled: boolean) {
    if (savingField) return;
    setSavingField("enabled");
    setError(null);
    log.logInteraction("live-trail:enabled:change", { enabled: nextEnabled });
    try {
      await setEnabled({ token, enabled: nextEnabled });
      log.logInteraction("live-trail:enabled:result", { enabled: nextEnabled, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      log.error("live-trail:enabled:error", "mutation", { message });
    } finally {
      setSavingField(null);
    }
  }

  async function handleVisibilityChange(nextVisible: boolean) {
    if (savingField) return;
    setSavingField("visibility");
    setError(null);
    log.logInteraction("live-trail:visibility:change", { visible: nextVisible });
    try {
      await setVisibility({ token, visibleToFollowers: nextVisible });
      log.logInteraction("live-trail:visibility:result", { visible: nextVisible, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      log.error("live-trail:visibility:error", "mutation", { message });
    } finally {
      setSavingField(null);
    }
  }

  async function handleDeleteRange() {
    if (savingField || !rangeIsValid || previewCount === 0) return;
    setSavingField("delete");
    setError(null);
    log.logInteraction("live-trail:delete-range:confirm", {
      startDate: combinedStart,
      endDate: combinedEnd,
      timeZone,
      previewCount,
    });
    try {
      const result = await deleteRange({
        token,
        startDate: combinedStart,
        endDate: combinedEnd,
        timeZone,
      });
      log.logInteraction("live-trail:delete-range:result", {
        deleted: result.deleted,
        ok: true,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      log.error("live-trail:delete-range:error", "mutation", { message });
    } finally {
      setSavingField(null);
    }
  }

  return (
    <div className="grid gap-8">
      <OptionsSection label="Recording">
        <OptionsGroup>
          <OptionsSwitchRow
            icon={Route}
            title="Live Trail"
            detail="Records GPS breadcrumbs only while Live GPS is on."
            checked={enabled}
            onChange={handleEnabledChange}
          />
          <OptionsSwitchRow
            icon={Eye}
            title="Show to Followers"
            detail="Followers see an approximate recent route, not precise breadcrumb data."
            checked={visibleToFollowers}
            onChange={handleVisibilityChange}
          />
        </OptionsGroup>
      </OptionsSection>

      <OptionsSection label="Delete Trail">
        <OptionsGroup>
          <div className="grid gap-5 p-4 sm:p-5">
            <div className="flex flex-wrap gap-2">
              {[
                { label: "30 min", min: 30 },
                { label: "1 hour", min: 60 },
                { label: "8 hours", min: 480 },
                { label: "24 hours", min: 1440 },
              ].map((range) => (
                <button
                  key={range.label}
                  type="button"
                  onClick={() => setQuickRange(range.min)}
                  className="rounded-full bg-[var(--meter-track)] px-3 py-1 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--line-soft)]"
                >
                  {range.label}
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <span className="text-sm font-semibold text-[var(--ink-1)]">Start</span>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="flex-1 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-1)]"
                  />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-1)]"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <span className="text-sm font-semibold text-[var(--ink-1)]">End</span>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="flex-1 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-1)]"
                  />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-1)]"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <LiveTrailPreviewMap samples={preview?.samples ?? []} log={log} />
              <p className="text-sm text-[var(--ink-3)]" aria-live="polite">
                {!rangeIsValid
                  ? "Choose an end time after the start time."
                  : preview
                    ? `${previewCount} breadcrumb${previewCount === 1 ? "" : "s"} selected in ${timeZone}.`
                    : `Loading preview in ${timeZone}...`}
              </p>
            </div>

            <Button
              type="button"
              variant="destructive"
              disabled={!rangeIsValid || previewCount === 0 || savingField === "delete"}
              onClick={() => void handleDeleteRange()}
              className="w-full sm:w-fit"
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              {savingField === "delete" ? "Deleting..." : "Delete selected breadcrumbs"}
            </Button>

            {error ? <p className="text-xs text-[var(--ink-danger)]" role="alert">{error}</p> : null}
          </div>
        </OptionsGroup>
      </OptionsSection>
    </div>
  );
}

function LiveTrailPreviewMap({ samples, log }: { samples: LiveTrailPreviewSample[]; log: DebugLogger }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const { resolvedMapBase, resolvedTheme } = useTheme();
  const lineColor = resolvedTheme === "constellation" ? "#ffd86a" : "#d92332";

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const styleUrl = getMapStyleResolution(resolvedMapBase).styleUrl;
    if (!styleUrl) {
      log.error("minimap:init:missing-style", "map", { resolvedMapBase });
      return;
    }

    log.logMap("minimap:init:start", { styleUrl, resolvedMapBase });
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleUrl,
      attributionControl: false,
      interactive: false,
      center: [0, 0],
      zoom: 1,
    });

    map.on("load", () => {
      log.logMap("minimap:load:success");
      setMapLoaded(true);
    });

    map.on("error", (e) => {
      log.error("minimap:error", "map", { error: e.error?.message ?? String(e) });
    });

    mapRef.current = map;

    return () => {
      log.logMap("minimap:remove");
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [resolvedMapBase, log]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const sourceId = "trail-preview";
    const lineLayerId = "trail-line";
    const pointLayerId = "trail-points";

    const sorted = [...samples].sort((a, b) => a.sampledAt - b.sampledAt);
    const features: GeoJSON.Feature[] = [];

    if (sorted.length > 1) {
      features.push({
        type: "Feature",
        properties: { kind: "line" },
        geometry: {
          type: "LineString",
          coordinates: sorted.map((s) => [s.lon, s.lat]),
        },
      });
    }

    sorted.forEach((s) => {
      features.push({
        type: "Feature",
        properties: { kind: "point" },
        geometry: {
          type: "Point",
          coordinates: [s.lon, s.lat],
        },
      });
    });

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    log.logMap("minimap:sync:data", {
      sampleCount: sorted.length,
      hasLine: sorted.length > 1,
      firstCoord: sorted[0] ? [sorted[0].lon, sorted[0].lat] : null,
    });

    const sync = () => {
      if (!map.isStyleLoaded()) {
        log.warn("minimap:sync:skipped-style-not-ready");
        return;
      }

      try {
        const rect = mapContainerRef.current?.getBoundingClientRect();
        log.logMap("minimap:sync:start", { 
          sampleCount: sorted.length,
          width: rect?.width,
          height: rect?.height,
          visible: rect && rect.width > 0 && rect.height > 0
        });

        // Ensure map matches container size
        map.resize();

        if (!map.getSource(sourceId)) {
          log.logMap("minimap:layers:add");
          map.addSource(sourceId, { type: "geojson", data: geojson });
          map.addLayer({
            id: lineLayerId,
            type: "line",
            source: sourceId,
            filter: ["==", ["get", "kind"], "line"],
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": lineColor,
              "line-width": 4,
              "line-dasharray": [2, 1],
            },
          });
          map.addLayer({
            id: pointLayerId,
            type: "circle",
            source: sourceId,
            filter: ["==", ["get", "kind"], "point"],
            paint: {
              "circle-radius": 5,
              "circle-color": "#ffffff",
              "circle-stroke-color": lineColor,
              "circle-stroke-width": 2,
            },
          });
        } else {
          log.logMap("minimap:layers:update");
          (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson);
          map.setPaintProperty(lineLayerId, "line-color", lineColor);
          map.setPaintProperty(pointLayerId, "circle-stroke-color", lineColor);
        }

        if (sorted.length > 0) {
          if (sorted.length === 1) {
            log.logMap("minimap:jump-to", { lon: sorted[0].lon, lat: sorted[0].lat });
            map.jumpTo({
              center: [sorted[0].lon, sorted[0].lat],
              zoom: 14,
            });
          } else {
            const bounds = new maplibregl.LngLatBounds();
            sorted.forEach((s) => bounds.extend([s.lon, s.lat]));
            log.logMap("minimap:fit-bounds", { bounds: bounds.toArray() });
            map.fitBounds(bounds, { padding: 40, animate: false, maxZoom: 15 });
          }
        }
      } catch (e) {
        log.error("minimap:sync:error", "map", { message: e instanceof Error ? e.message : String(e) });
      }
    };

    let resizeObserver: ResizeObserver | null = null;
    let rafHandle: number | null = null;

    const runOrScheduleSync = () => {
      const container = mapContainerRef.current;
      if (!container) {
        sync();
        return;
      }
      const height = container.getBoundingClientRect().height;
      if (height > 0) {
        sync();
      } else {
        // Container height is 0 (shouldn't normally happen with the wrapper div fix, but guard anyway).
        resizeObserver = new ResizeObserver((entries) => {
          const bcrH = entries[0]?.contentRect.height ?? 0;
          if (bcrH > 0 || container.offsetHeight > 0) {
            resizeObserver?.disconnect();
            resizeObserver = null;
            if (rafHandle !== null) { cancelAnimationFrame(rafHandle); rafHandle = null; }
            sync();
          }
        });
        resizeObserver.observe(container);

        // rAF polling as fallback if ResizeObserver doesn't fire
        const poll = () => {
          if ((mapContainerRef.current?.getBoundingClientRect().height ?? 0) > 0 ||
              (mapContainerRef.current as HTMLElement | null)?.offsetHeight) {
            resizeObserver?.disconnect();
            resizeObserver = null;
            rafHandle = null;
            sync();
          } else {
            rafHandle = requestAnimationFrame(poll);
          }
        };
        rafHandle = requestAnimationFrame(poll);
      }
    };

    if (map.isStyleLoaded()) {
      runOrScheduleSync();
    } else {
      log.logMap("minimap:wait-style-load");
      map.once("load", runOrScheduleSync);
    }

    return () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
      if (rafHandle !== null) { cancelAnimationFrame(rafHandle); rafHandle = null; }
    };
  }, [samples, lineColor, log, mapLoaded]);

  return (
    <div
      role="img"
      aria-label="Live Trail deletion preview map"
      className="relative h-40 w-full overflow-hidden rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)]"
    >
      {/* Wrapper owns the absolute positioning so MapLibre's .maplibregl-map CSS (position:relative) can't collapse it */}
      <div className="absolute inset-0">
        <div ref={mapContainerRef} className="h-full w-full" />
      </div>
      {samples.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-paper)]/50 backdrop-blur-[2px]">
          <p className="font-[var(--font-mono)] text-[10px] font-medium uppercase tracking-wider text-[var(--ink-3)]">
            No breadcrumbs in range
          </p>
        </div>
      )}
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
            // Set to fixed height to prevent layout shifts when logs populate (Issue 3)
            "h-[88dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-sheet)]",
            view === "debug-logs" && "overflow-hidden",
          )}
        >
          {view === "travel-funds" ? (
            <SubViewHeader
              title={TERMS.travelFunds}
              onBack={() => { music.sfx("page"); navigateTo("options"); }}
            />
          ) : view === "live-trail" ? (
            <SubViewHeader
              title="Live Trail"
              onBack={() => { music.sfx("page"); navigateTo("options"); }}
            />
          ) : view === "cloaking-pins" ? (
            <SubViewHeader
              title="Cloaking Zones"
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
            <div className="relative">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-[var(--header-gradient)]" />
              <OptionsHomeHeader role={role} />
            </div>
          )}

          {view === "travel-funds" ? (
            <SheetBody className="p-0">
              <OptionsContentFrame className="py-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                <TravelFundsSheet
                  token={session.token}
                  onClose={() => { music.sfx("page"); navigateTo("options"); }}
                  debugSource={{ source: "options:travel-funds", sourceLabel: "Options -> Travel Funds" }}
                />
              </OptionsContentFrame>
            </SheetBody>
          ) : view === "live-trail" ? (
            <SheetBody className="p-0">
              <OptionsContentFrame className="py-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                <LiveTrailSettingsSheet token={session.token} log={log} />
              </OptionsContentFrame>
            </SheetBody>
          ) : view === "cloaking-pins" ? (
            <SheetBody className="p-0">
              <OptionsContentFrame className="py-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                <CloakingPinsSheet token={session.token} log={log} />
              </OptionsContentFrame>
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
              onLiveTrail={() => { music.sfx("page"); navigateTo("live-trail"); }}
              onCloakingPins={() => { music.sfx("page"); navigateTo("cloaking-pins"); }}
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
  const updatePreferences = useMutation(tripcastApi.travelerPreferences.travelerUpdatePreferences);

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
    ? (preferences?.allowFollowersTripPath ?? false)
    : (followerPreferences?.visible ? followerPreferences.allowFollowersTripPath : false);

  const toggleAllowFollowers = async (checked: boolean) => {
    await updatePreferences({ token, allowFollowersTripPath: checked });
  };

  return (
    <>
      <OptionsSwitchRow
        title="Show Trip Path"
        detail={
          role === "follower"
            ? "Show the traveler's pin path. May not appear if the traveler has disabled it."
            : "Draw a dashed line connecting your pins."
        }
        checked={showTripPath}
        onChange={toggleShowPath}
      />

      {role === "traveler" ? (
        <OptionsSwitchRow
          title="Followers can see Trip Path"
          detail="Allow Followers to see your chronological path."
          checked={allowFollowers}
          onChange={toggleAllowFollowers}
        />
      ) : null}
    </>
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
  onLiveTrail,
  onCloakingPins,
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
  onLiveTrail: () => void;
  onCloakingPins: () => void;
  onDebugLogs: () => void;
  onBulkImport: () => void;
  onBulkExport: () => void;
  onEmergencyReset: () => void;
  onEndTrip?: () => void;
  onViewCredits?: () => void;
}) {
  const developerSection = (
    <OptionsSection label="Developer">
      <OptionsGroup>
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
        {role === "traveler" ? (
          <OptionsRow
            icon={Bomb}
            title="Crash App (test error boundary)"
            detail="Throws a render error to show the full-screen fallback — plays the bubble pop and stops music. Retry recovers."
            danger
            onClick={() => {
              log.logUi("action:crash-app");
              triggerCrash();
            }}
          />
        ) : null}
      </OptionsGroup>
    </OptionsSection>
  );

  return (
    <SheetBody className="p-0">
      <OptionsContentFrame className="grid gap-10 py-8 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
        {role === "traveler" ? developerSection : null}

        <PrivacyFollowersSection token={session.token} />
        <AppearanceSection />
        <SoundSection />
        <ReadingSection />

        <OptionsSection label="Account">
          <OptionsGroup>
            <MapSettingsSection token={session.token} role={role} />
            {role === "traveler" ? (
              <OptionsRow
                icon={Route}
                title="Live Trail"
                detail="GPS breadcrumbs, follower visibility, and cleanup"
                onClick={() => {
                  log.logUi("action:live-trail-settings");
                  onLiveTrail();
                }}
              />
            ) : null}
            {role === "traveler" ? (
              <OptionsRow
                icon={EyeOff}
                title="Cloaking Zones"
                detail="GPS exclusion zones and auto-pause settings"
                onClick={() => {
                  log.logUi("action:cloaking-pins-settings");
                  onCloakingPins();
                }}
              />
            ) : null}

            <InfoRow
              icon={User}
              title={session.displayName ?? (session.username ? `@${session.username}` : "Signed in")}
              detail="Display name"
            />
            {role === "follower" ? <FollowerAttributionToggle token={session.token} /> : null}
            <OptionsRow
              icon={LogOut}
              title="Sign out"
              danger
              onClick={() => {
                log.logUi("action:sign-out");
                onSignOut();
              }}
            />
          </OptionsGroup>
        </OptionsSection>

      {role === "traveler" ? (
        <>
          <OptionsSection label="Followers">
            <OptionsGroup>
              <div className="p-4 sm:p-5">
                <p className="mb-3 flex items-center gap-2 text-base font-semibold text-[var(--ink-1)]">
                  <UserPlus className="h-5 w-5" aria-hidden />
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
            </OptionsGroup>
          </OptionsSection>

          <TravelerTimezoneSection token={session.token} />

          <OptionsSection label={TERMS.travelFunds}>
            <OptionsGroup>
              <OptionsRow
                icon={Wallet}
                title={`Manage ${TERMS.travelFunds}`}
                detail="Budget, pace, and transactions"
                onClick={() => {
                  log.logUi("action:manage-travel-funds");
                  onTravelFunds();
                }}
              />
            </OptionsGroup>
          </OptionsSection>

          <MissionSettingsSection token={session.token} />

          <OptionsSection label="Data / Dev">
            <OptionsGroup>
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
              <MysteryMissionsOptionsRow token={session.token} />
            </OptionsGroup>
          </OptionsSection>

          <OptionsSection label="Tour">
            <OptionsGroup>
              <OptionsRow
                icon={Play}
                title="Replay welcome tour"
                detail="Preview the onboarding intro"
                onClick={() => {
                  log.logUi("action:replay-tour");
                  onReplayFollowerTour();
                }}
              />
            </OptionsGroup>
          </OptionsSection>

          {onEndTrip || onViewCredits ? (
            <OptionsSection label="Finale">
              <OptionsGroup>
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
              </OptionsGroup>
            </OptionsSection>
          ) : null}
        </>
      ) : (
        <OptionsSection label="Trip">
          <OptionsGroup>
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
          </OptionsGroup>
        </OptionsSection>
      )}

      {role === "traveler" ? (
        <OptionsSection label={TERMS.dangerZone}>
          <OptionsGroup>
            <OptionsRow icon={ShieldAlert} title={TERMS.emergencyReset} detail="Wipe shared trip data" danger onClick={onEmergencyReset} />
          </OptionsGroup>
        </OptionsSection>
      ) : null}

      {role === "follower" ? developerSection : null}
      </OptionsContentFrame>
    </SheetBody>
  );
}

function OptionsHomeHeader({ role }: { role: "traveler" | "follower" }) {
  return (
    <div className="relative border-b border-[var(--line-soft)]" data-options-role={role}>
      <OptionsContentFrame className="grid h-14 grid-cols-[2rem_1fr_2rem] items-center gap-4 py-0">
        <span aria-hidden />
        <SheetTitle className="justify-self-center font-[var(--font-display)] text-2xl font-bold text-[var(--ink-1)]">
          {TERMS.options}
        </SheetTitle>
        <SheetCloseButton aria-label="Close options" className="justify-self-end" />
      </OptionsContentFrame>
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
    <div className="relative border-b border-[var(--line-soft)]">
      <OptionsContentFrame className="grid h-14 grid-cols-[2rem_1fr_2rem] items-center gap-4 py-0">
        <SheetBackButton onClick={onBack} className="justify-self-start" />
        <SheetTitle className="min-w-0 justify-self-center truncate font-[var(--font-display)] text-2xl font-bold text-[var(--ink-1)]">
          {title}
        </SheetTitle>
        <SheetCloseButton aria-label={`Close ${title}`} className="justify-self-end" />
      </OptionsContentFrame>
    </div>
  );
}

function SoundSection() {
  const music = useMusicSafe();
  const volumePercent = Math.round(music.volume * 100);

  return (
    <OptionsSection label="Sound">
      <OptionsGroup>
        <div className="grid gap-6 p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                music.sfx("tap");
                music.setMute(!music.mute);
              }}
              className={cn(
                "grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-colors",
                music.mute
                  ? "bg-[var(--meter-track)] text-[var(--ink-2)]"
                  : "bg-[var(--flag)] text-[var(--ink-on-brand)]",
              )}
              aria-label={music.mute ? "Unmute sound" : "Mute sound"}
            >
              {music.mute ? <VolumeX className="h-5 w-5" aria-hidden /> : <Volume2 className="h-5 w-5" aria-hidden />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-[var(--ink-1)]">{music.mute ? "Muted" : "Playing"}</p>
              <p className="text-sm text-[var(--ink-3)]">
                {music.mute ? "Audio disabled" : `${SOUNDTRACK_OPTIONS.find((option) => option.value === music.soundtrack)?.label ?? "Auto"} soundtrack`}
              </p>
            </div>
          </div>

          <label className="grid gap-3 text-xs font-semibold uppercase text-[var(--ink-3)]">
            <span className="flex items-center justify-between">
              <span>Volume</span>
              <span>{volumePercent}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={volumePercent}
              onChange={(event) => music.setVolume(Number(event.target.value) / 100)}
              style={{ accentColor: "var(--flag)" }}
              aria-label="Sound volume"
              className="w-full"
            />
          </label>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase text-[var(--ink-3)]">Soundtrack</p>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {SOUNDTRACK_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  music.sfx("tap");
                  music.setSoundtrack(option.value);
                }}
                className={cn(
                  "min-h-11 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors",
                  music.soundtrack === option.value
                    ? "border-[var(--ink-1)] bg-[var(--ink-1)] text-[var(--bg-paper)]"
                    : "border-[var(--line-soft)] bg-[var(--bg-paper)] text-[var(--ink-2)] hover:bg-[var(--meter-track)]",
                )}
              >
                {option.label}
              </button>
            ))}
            </div>
          </div>
        </div>
      </OptionsGroup>
    </OptionsSection>
  );
}

function ReadingSection() {
  const reading = useReadingSpeedSafe();
  return (
    <OptionsSection label="Story / Reading">
      <OptionsGroup>
        <div className="grid gap-4 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-base font-semibold text-[var(--ink-1)]">
            <BookOpen className="h-5 w-5" aria-hidden />
            Story text reveal speed
          </div>
          <OptionsSegmentedControl
            value={reading.speed}
            options={(["slow", "normal", "fast", "instant"] as ReadingSpeed[]).map((speed) => ({
              value: speed,
              label: speed,
            }))}
            onChange={(speed) => reading.setSpeed(speed as ReadingSpeed)}
          />
        </div>
      </OptionsGroup>
    </OptionsSection>
  );
}

function OptionsSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h3 className="font-[var(--font-mono)] text-[11px] font-semibold uppercase text-[var(--ink-3)]">
        {label}
      </h3>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function OptionsGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] shadow-sm divide-y divide-[var(--line-soft)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function OptionsIcon({
  icon: Icon,
  danger = false,
}: {
  icon: LucideIcon;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--meter-track)] text-[var(--ink-2)]",
        danger && "bg-[var(--bg-danger)] text-[var(--ink-danger)]",
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </div>
  );
}

function OptionsSwitch({
  checked,
}: {
  checked: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors",
        checked ? "bg-[var(--ink-1)]" : "bg-[var(--meter-track)]",
      )}
    >
      <span
        className={cn(
          "absolute top-1 h-5 w-5 rounded-full bg-[var(--bg-card)] shadow-sm transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </span>
  );
}

function OptionsSwitchRow({
  icon,
  title,
  detail,
  checked,
  onChange,
}: {
  icon?: LucideIcon;
  title: string;
  detail?: string;
  checked: boolean;
  onChange: (checked: boolean) => void | Promise<void>;
}) {
  return (
    <label className="flex min-h-16 cursor-pointer items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-[var(--meter-track)]/40 sm:px-5">
      {icon ? <OptionsIcon icon={icon} /> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium text-[var(--ink-1)]">{title}</span>
        {detail ? <span className="block text-sm text-[var(--ink-3)]">{detail}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          void onChange(event.target.checked);
        }}
        className="sr-only"
      />
      <OptionsSwitch checked={checked} />
    </label>
  );
}

function OptionsSegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string; icon?: LucideIcon }>;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="grid gap-1 rounded-xl border border-[var(--line-soft)] bg-[var(--meter-track)] p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all",
              active
                ? "bg-[var(--ink-1)] text-[var(--bg-paper)] shadow-sm"
                : "text-[var(--ink-2)] hover:bg-[var(--bg-card)]",
            )}
          >
            {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
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
    <div className="flex min-h-16 items-center gap-4 px-4 py-3 sm:px-5">
      <OptionsIcon icon={Icon} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-[var(--ink-1)]">{title}</p>
        {detail ? <p className="text-sm text-[var(--ink-3)]">{detail}</p> : null}
      </div>
    </div>
  );
}

export function OptionsRow({
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
        "flex min-h-16 w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-[var(--meter-track)]/40 sm:px-5",
        danger && "bg-[var(--bg-danger)] text-[var(--ink-danger)] hover:bg-[var(--bg-danger)]",
      )}
    >
      <OptionsIcon icon={Icon} danger={danger} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-base font-medium text-[var(--ink-1)]", danger && "text-[var(--ink-danger)]")}>{title}</p>
        {detail ? <p className={cn("text-sm text-[var(--ink-3)]", danger && "text-[var(--ink-danger)]")}>{detail}</p> : null}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden />
    </button>
  );
}

function MysteryMissionsOptionsRow({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const log = useDebugLogger("MysteryMissionsOptionsRow", "src/features/options/OptionsSheet.tsx");

  return (
    <>
      <OptionsRow
        icon={RadioTower}
        title="Mystery Missions"
        detail="Import, export, and review proximity signals"
        onClick={() => {
          log.logUi("action:mystery-missions");
          setOpen(true);
        }}
      />
      <MysteryMissionsSheet
        open={open}
        token={token}
        onOpenChange={setOpen}
      />
    </>
  );
}

const TIMEOUT_OPTIONS = [
  { value: "0", label: "Off" },
  { value: "5", label: "5 min" },
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
];

const RADIUS_OPTIONS = [
  { value: "100", label: "100 m" },
  { value: "200", label: "200 m" },
  { value: "500", label: "500 m" },
  { value: "1000", label: "1 km" },
];

function CloakingPinsSheet({ token, log }: { token: string; log: DebugLogger }) {
  const pins = useQuery(tripcastApi.cloakingPins.travelerListCloakingPins, { token });
  const deletePin = useMutation(tripcastApi.cloakingPins.travelerDeleteCloakingPin);

  const [timeoutMinutes, setTimeoutMinutes] = useState<string>(() => {
    try { return localStorage.getItem("tripcast.cloaking.autoDisableGpsTimeoutMinutes") ?? "5"; } catch { return "5"; }
  });
  const [defaultRadius, setDefaultRadius] = useState<string>(() => {
    try { return localStorage.getItem("tripcast.cloaking.defaultCloakingRadiusMeters") ?? "200"; } catch { return "200"; }
  });

  useEffect(() => {
    log.logInteraction("cloaking-pins:settings:open");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTimeoutChange(value: string) {
    setTimeoutMinutes(value);
    try { localStorage.setItem("tripcast.cloaking.autoDisableGpsTimeoutMinutes", value); } catch { /* storage unavailable */ }
  }

  function handleRadiusChange(value: string) {
    setDefaultRadius(value);
    try { localStorage.setItem("tripcast.cloaking.defaultCloakingRadiusMeters", value); } catch { /* storage unavailable */ }
  }

  function handleDelete(pin: CloakingPin) {
    log.logInteraction("cloaking-pins:delete", { pinId: pin._id });
    deletePin({ token, pinId: pin._id }).catch((err: unknown) => {
      log.error("cloaking-pins:delete:error", "mutation", {
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }

  const resolvedTimeoutValue = TIMEOUT_OPTIONS.some((o) => o.value === timeoutMinutes) ? timeoutMinutes : "5";
  const resolvedRadiusValue = RADIUS_OPTIONS.some((o) => o.value === defaultRadius) ? defaultRadius : "200";

  return (
    <div className="grid gap-8">
      <OptionsSection label="Preferences">
        <OptionsGroup>
          <div className="px-4 py-3 sm:px-5">
            <p className="mb-3 text-base font-medium text-[var(--ink-1)]">Auto-pause timeout</p>
            <OptionsSegmentedControl
              value={resolvedTimeoutValue}
              options={TIMEOUT_OPTIONS}
              onChange={handleTimeoutChange}
            />
          </div>
          <div className="px-4 py-3 sm:px-5">
            <p className="mb-3 text-base font-medium text-[var(--ink-1)]">Default zone radius</p>
            <OptionsSegmentedControl
              value={resolvedRadiusValue}
              options={RADIUS_OPTIONS}
              onChange={handleRadiusChange}
            />
          </div>
        </OptionsGroup>
      </OptionsSection>

      <OptionsSection label="Active Zones">
        {pins === undefined ? null : pins.length === 0 ? (
          <p className="text-sm text-[var(--ink-3)]">
            No zones yet. Right-click or long-press the map to add one.
          </p>
        ) : (
          <OptionsGroup>
            {pins.map((pin) => (
              <div
                key={pin._id}
                className="flex min-h-16 items-center gap-4 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium text-[var(--ink-1)]">
                    {pin.label ?? `${pin.lat.toFixed(4)}, ${pin.lon.toFixed(4)}`}
                  </p>
                  <p className="text-sm text-[var(--ink-3)]">
                    {pin.radiusMeters >= 1000
                      ? `${(pin.radiusMeters / 1000).toFixed(1)} km radius`
                      : `${pin.radiusMeters} m radius`}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Delete cloaking zone"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[var(--ink-3)] hover:bg-[var(--meter-track)] hover:text-[var(--ink-danger)]"
                  onClick={() => handleDelete(pin)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
          </OptionsGroup>
        )}
      </OptionsSection>
    </div>
  );
}

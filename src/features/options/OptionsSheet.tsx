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
  Bell,
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
  SunMoon,
  User,
  UserRoundPen,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import DebugPanel from "../../debug/DebugPanel";
import type { DebugLogger } from "../../debug/useDebugLogger";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { logMapEvent } from "../../debug/debugLogger";
import { useTheme } from "../../providers/ThemeProvider";
import { useActiveUiContext } from "../../debug/useActiveUiContext";

import { tripcastApi } from "../../convex/tripcastApi";
import { useSamplerMode, setSamplerMode, SAMPLER_MODE_INFO, type SamplerMode } from "../../lib/samplerMode";
import { useFixOverlayEnabled, setFixOverlayEnabled } from "../../lib/fixOverlayToggle";
import { useEgressEstimateBytes } from "../../lib/egressMeter";
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
import { useFollowerCutoffPreview } from "./followerCutoffPreview";
import BulkExportSheet from "./BulkExportSheet";
import MysteryMissionsSheet from "./MysteryMissionsSheet";
import QuickActivitySettingsView from "./QuickActivitySettings";
import { TERMS } from "../../copy/terminology";
import { useTicker, TripTicker } from "../hud";
import { triggerMapCooldown } from "../map/mapService";
import { triggerCrash } from "../../debug/crashTrigger";
import { getMapStyleResolution } from "../map/mapService";
import { computeAutoState } from "../travelstate/autoStateCalc";

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
  onTriggerTestToast?: () => void;
  /** Traveler-only: open the End Trip flow (handled on the map). */
  onEndTrip?: () => void;
  /** Either role: open the full-screen trip credits. */
  onViewCredits?: () => void;
  preserveDebugContext?: boolean;
};

export type OptionsView = "options" | "emergency-reset" | "travel-funds" | "live-trail" | "bulk-import" | "bulk-export" | "mystery-missions" | "debug-logs" | "cloaking-pins" | "follower-cutoff" | "trip-ticker" | "quick-activities";
type LiveTrailDeleteMode = "range" | "every_other" | "individual";

const TICKER_PREVIEW_MESSAGE = {
  id: "preview-demo",
  text: "Sample fact — this is what your ticker will look like.",
  kind: "fact" as const,
};

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

export const SOUNDTRACK_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "song4_day", label: "Day" },
  { value: "song4_night", label: "Night" },
  { value: "song7_story", label: "Story" },
  { value: "song8_trophy", label: "Trophy" },
  { value: "song6_vote", label: "Vote" },
  { value: "song9_intro", label: "Hello" },
  { value: "song10_credits", label: "Finale" },
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

export function FollowerCutoffSection({ token, log }: { token: string; log: DebugLogger }) {
  const preferences = useQuery(tripcastApi.travelerPreferences.travelerGetPreferences, { token });
  const oldestContent = useQuery(tripcastApi.travelerPreferences.travelerGetOldestContent, { token });
  const updatePreferences = useMutation(tripcastApi.travelerPreferences.travelerUpdatePreferences);
  const preview = useFollowerCutoffPreview("traveler", token);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cutoffAt = preferences?.followerContentCutoffAt;
  const enabled = preferences?.followerContentCutoffEnabled ?? false;
  const timeZone = preferences?.travelerTimeZone ?? detectBrowserTimeZone() ?? "UTC";

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  // Sync pickers from server. Run when the saved value or timezone changes so
  // mutations from other clients reflect immediately.
  useEffect(() => {
    if (cutoffAt) {
      setDate(formatDateInputValue(cutoffAt, timeZone));
      setTime(formatTimeInputValue(cutoffAt, timeZone));
    } else {
      setDate("");
      setTime("");
    }
  }, [cutoffAt, timeZone]);

  const previewCutoffMs = useMemo(() => {
    if (!date || !time) return null;
    const dt = dayjs.tz(`${date}T${time}`, timeZone);
    const ms = dt.valueOf();
    return Number.isFinite(ms) ? ms : null;
  }, [date, time, timeZone]);

  const countsSkip = !enabled || previewCutoffMs === null;
  const counts = useQuery(
    tripcastApi.travelerPreferences.travelerCountContentBeforeCutoff,
    countsSkip ? "skip" : { token, cutoffAt: previewCutoffMs as number },
  );

  useEffect(() => {
    log.logInteraction("follower-cutoff:open");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggle(nextEnabled: boolean) {
    setError(null);
    setSaving(true);
    log.logInteraction("follower-cutoff:toggle", { enabled: nextEnabled });
    try {
      await updatePreferences({ token, followerContentCutoffEnabled: nextEnabled });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    log.logInteraction("follower-cutoff:save", { date, time, timeZone });
    try {
      let nextCutoffAt: number | null = null;
      if (date && time) {
        const dt = dayjs.tz(`${date}T${time}`, timeZone);
        nextCutoffAt = dt.valueOf();
      }
      await updatePreferences({ token, followerContentCutoffAt: nextCutoffAt });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleUseOldest() {
    if (!oldestContent) return;
    setDate(formatDateInputValue(oldestContent.timestamp, timeZone));
    setTime(formatTimeInputValue(oldestContent.timestamp, timeZone));
    log.logInteraction("follower-cutoff:use-oldest", {
      sourceType: oldestContent.sourceType,
      timestamp: oldestContent.timestamp,
    });
  }

  function handleUseNow() {
    const now = Date.now();
    setDate(formatDateInputValue(now, timeZone));
    setTime(formatTimeInputValue(now, timeZone));
    log.logInteraction("follower-cutoff:use-now", { timestamp: now });
  }

  const savedFormatted = cutoffAt ? dayjs.tz(cutoffAt, timeZone).format("MMM D, YYYY h:mm A z") : null;
  const previewFormatted = previewCutoffMs ? dayjs.tz(previewCutoffMs, timeZone).format("MMM D, YYYY h:mm A z") : null;
  const oldestFormatted = oldestContent
    ? dayjs.tz(oldestContent.timestamp, timeZone).format("MMM D, YYYY h:mm A z")
    : null;
  const pickerEditedSinceSave = previewCutoffMs !== null && previewCutoffMs !== cutoffAt;

  return (
    <div className="grid gap-6">
      <OptionsSection label="About">
        <OptionsGroup>
          <div className="grid gap-3 p-4 sm:p-5">
            <div className="flex items-start gap-4">
              <OptionsIcon icon={Shield} />
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-[var(--ink-1)]">Follower content cutoff</p>
                <p className="text-sm text-[var(--ink-3)]">
                  Hide trip content from before a chosen date/time from Followers. Hidden
                  content is not deleted &mdash; you can change or remove the cutoff at any time
                  and Followers will see it again instantly. Achievement points already
                  earned are never removed.
                </p>
              </div>
            </div>
          </div>
        </OptionsGroup>
      </OptionsSection>

      <OptionsSection label="Enable">
        <OptionsGroup>
          <OptionsSwitchRow
            icon={enabled ? EyeOff : Eye}
            title={enabled ? "Cutoff enabled" : "Cutoff disabled"}
            detail={
              enabled
                ? "Followers see only content at or after the cutoff."
                : "All trip content is visible to Followers."
            }
            checked={enabled}
            onChange={(checked) => { void handleToggle(checked); }}
          />
        </OptionsGroup>
      </OptionsSection>

      <OptionsSection label="Cutoff date and time">
        <OptionsGroup>
          <div className="grid gap-4 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <label
                  htmlFor="cutoff-date"
                  className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]"
                >
                  Date
                </label>
                <input
                  id="cutoff-date"
                  type="date"
                  value={date}
                  disabled={!enabled || saving}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-1)] disabled:opacity-60"
                />
              </div>
              <div className="grid gap-2">
                <label
                  htmlFor="cutoff-time"
                  className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]"
                >
                  Time
                </label>
                <input
                  id="cutoff-time"
                  type="time"
                  value={time}
                  disabled={!enabled || saving}
                  onChange={(e) => setTime(e.target.value)}
                  className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-1)] disabled:opacity-60"
                />
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={!enabled || saving || !date || !time || !pickerEditedSinceSave}
              onClick={() => { void handleSave(); }}
              className="w-full sm:w-fit"
            >
              {saving ? "Saving..." : "Save cutoff"}
            </Button>

            {error ? (
              <p className="text-xs text-[var(--ink-danger)]" role="alert">{error}</p>
            ) : null}
          </div>
        </OptionsGroup>
      </OptionsSection>

      <OptionsSection label="Status">
        <OptionsGroup>
          <div className="grid gap-2 p-4 text-sm text-[var(--ink-3)] sm:p-5">
            <p>
              <span className="font-semibold text-[var(--ink-1)]">Current cutoff: </span>
              {enabled && savedFormatted
                ? savedFormatted
                : !enabled && savedFormatted
                  ? `Disabled (saved: ${savedFormatted})`
                  : "None"}
            </p>
            {enabled && previewCutoffMs !== null ? (
              <p>
                <span className="font-semibold text-[var(--ink-1)]">Hiding from Followers: </span>
                {counts === undefined
                  ? "Counting..."
                  : `${counts.stories} Stories · ${counts.missions} Missions · ${counts.routeVotes} Route Votes · ${counts.trailSamples} Trail samples`}
                {pickerEditedSinceSave ? ` (preview at ${previewFormatted})` : null}
              </p>
            ) : null}
            <p>
              <span className="font-semibold text-[var(--ink-1)]">Oldest item: </span>
              {oldestContent === undefined
                ? "Loading..."
                : oldestContent === null
                  ? "No trip content yet."
                  : `${oldestFormatted} (${oldestContent.sourceType === "story" ? "Story" : "Mission"})`}
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {oldestContent ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!enabled || saving}
                  onClick={handleUseOldest}
                  className="text-xs"
                >
                  Use oldest as cutoff
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                disabled={!enabled || saving}
                onClick={handleUseNow}
                className="text-xs"
              >
                Use now as cutoff
              </Button>
            </div>
          </div>
        </OptionsGroup>
      </OptionsSection>

      {preview.available ? (
        <OptionsSection label="Your view">
          <OptionsGroup>
            <OptionsSwitchRow
              icon={Eye}
              title="Show all"
              detail="By default your own view is filtered to match what Followers see. Turn this on to bypass the cutoff and reach pre-cutoff content for admin, export, or debug. Per-tab only — closing the tab or starting a new session restores the filtered view."
              checked={preview.showAll}
              onChange={(next) => {
                log.logInteraction("follower-cutoff:show-all-toggle", { showAll: next });
                preview.setShowAll(next);
              }}
            />
          </OptionsGroup>
        </OptionsSection>
      ) : null}
    </div>
  );
}

const CURATED_TIMEZONES: ReadonlyArray<string> = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Atlantic/Reykjavik",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Athens",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

const SELECT_DEVICE = "__device__";
const SELECT_OTHER = "__other__";

function isValidIanaTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Project default theme window when the Traveler hasn't set one. Mirrors the
// FALLBACK_* constants in ThemeProvider; kept in sync by hand.
const DEFAULT_THEME_DAY_START_MINUTES = 6 * 60; // 06:00
const DEFAULT_THEME_NIGHT_START_MINUTES = 21 * 60; // 21:00

function minutesToTimeInput(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeInputToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function TravelerTimezoneSection({ token }: { token: string }) {
  const preferences = useQuery(tripcastApi.travelerPreferences.travelerGetPreferences, { token });
  const autoState = useQuery(tripcastApi.travelerAutoState.travelerGetAutoState, { token });
  const setTimeZone = useMutation(tripcastApi.travelerPreferences.travelerSetTimeZone);
  const rebaseTimeZone = useMutation(
    tripcastApi.travelerAutoState.travelerRebaseAutoStateTimeZone,
  );
  const updatePreferences = useMutation(
    tripcastApi.travelerPreferences.travelerUpdatePreferences,
  );

  const [selection, setSelection] = useState<string>("");
  const [customTz, setCustomTz] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const detectedTimeZone = detectBrowserTimeZone();
  const savedTimeZone = preferences?.travelerTimeZone ?? null;
  const savedSource = preferences?.travelerTimeZoneSource ?? null;
  const autoEnabled = Boolean(autoState?.autoStateEnabled);

  const savedDayStart = preferences?.themeDayStartMinutes;
  const savedNightStart = preferences?.themeNightStartMinutes;
  const effectiveDayStart =
    typeof savedDayStart === "number" ? savedDayStart : DEFAULT_THEME_DAY_START_MINUTES;
  const effectiveNightStart =
    typeof savedNightStart === "number" ? savedNightStart : DEFAULT_THEME_NIGHT_START_MINUTES;

  const [dayInput, setDayInput] = useState<string>(() => minutesToTimeInput(effectiveDayStart));
  const [nightInput, setNightInput] = useState<string>(() =>
    minutesToTimeInput(effectiveNightStart),
  );
  const [savingWindow, setSavingWindow] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);
  const [windowSuccess, setWindowSuccess] = useState<string | null>(null);

  // Keep inputs in sync with the live query (e.g. another device updated prefs).
  useEffect(() => {
    setDayInput(minutesToTimeInput(effectiveDayStart));
  }, [effectiveDayStart]);
  useEffect(() => {
    setNightInput(minutesToTimeInput(effectiveNightStart));
  }, [effectiveNightStart]);

  const isThemeWindowExplicit =
    typeof savedDayStart === "number" && typeof savedNightStart === "number";

  async function applyTimeZone(newTimeZone: string, source: "device" | "manual") {
    if (saving) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await setTimeZone({ token, timeZone: newTimeZone, source });

      // When autoState is on, the stored autoTimeZone also drives bedtime/wake
      // estimation. Rebase it so the picker is a single control for both.
      if (
        autoState?.autoStateEnabled &&
        autoState.autoEnabledAt != null &&
        autoState.autoBaseEnergyScore != null &&
        autoState.autoBaseStomachScore != null &&
        autoState.autoTimeZone !== newTimeZone
      ) {
        const estimate = computeAutoState({
          autoTimeZone: autoState.autoTimeZone,
          autoBedtimeMinutes: autoState.autoBedtimeMinutes,
          autoWakeTimeMinutes: autoState.autoWakeTimeMinutes,
          autoEnergyMin: autoState.autoEnergyMin,
          autoEnergyMax: autoState.autoEnergyMax,
          autoStomachMin: autoState.autoStomachMin,
          autoStomachMax: autoState.autoStomachMax,
          autoEnergySleepDeltaPerTick: autoState.autoEnergySleepDeltaPerTick,
          autoEnergyAwakeDeltaPerTick: autoState.autoEnergyAwakeDeltaPerTick,
          autoStomachAwakeDeltaPerTick: autoState.autoStomachAwakeDeltaPerTick,
          autoStomachNightAboveHungryEveryTicks:
            autoState.autoStomachNightAboveHungryEveryTicks,
          autoStomachNightAtOrBelowHungryEveryTicks:
            autoState.autoStomachNightAtOrBelowHungryEveryTicks,
          baseEnergy: autoState.autoBaseEnergyScore,
          baseStomach: autoState.autoBaseStomachScore,
          autoEnabledAt: autoState.autoEnabledAt,
          targetTime: Date.now(),
        });
        await rebaseTimeZone({
          token,
          newTimeZone,
          rebasedEstimatedEnergy: estimate.estimatedEnergy,
          rebasedEstimatedStomach: estimate.estimatedStomach,
        });
      }

      setSuccess(`Timezone set to ${newTimeZone}${source === "device" ? " (device)" : ""}.`);
      setSelection("");
      setCustomTz("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyChoice() {
    if (saving) return;
    if (selection === SELECT_DEVICE) {
      if (!detectedTimeZone) {
        setError("Could not detect this device's timezone.");
        return;
      }
      await applyTimeZone(detectedTimeZone, "device");
      return;
    }
    if (selection === SELECT_OTHER) {
      const trimmed = customTz.trim();
      if (!trimmed) {
        setError("Type an IANA timezone name (e.g. America/Los_Angeles).");
        return;
      }
      if (!isValidIanaTimeZone(trimmed)) {
        setError(`"${trimmed}" isn't a recognized IANA timezone name.`);
        return;
      }
      await applyTimeZone(trimmed, "manual");
      return;
    }
    if (selection) {
      await applyTimeZone(selection, "manual");
    }
  }

  const applyDisabled =
    saving ||
    !selection ||
    (selection === SELECT_DEVICE && !detectedTimeZone) ||
    (selection === SELECT_OTHER && customTz.trim().length === 0);

  async function handleSaveThemeWindow() {
    if (savingWindow) return;
    setWindowError(null);
    setWindowSuccess(null);

    const day = timeInputToMinutes(dayInput);
    const night = timeInputToMinutes(nightInput);
    if (day == null) {
      setWindowError("Day start must be a valid time (HH:MM).");
      return;
    }
    if (night == null) {
      setWindowError("Night start must be a valid time (HH:MM).");
      return;
    }
    if (day === night) {
      setWindowError("Day and Night start times must be different.");
      return;
    }

    setSavingWindow(true);
    try {
      await updatePreferences({
        token,
        themeDayStartMinutes: day,
        themeNightStartMinutes: night,
      });
      setWindowSuccess(
        `Day starts ${minutesToTimeInput(day)}, night starts ${minutesToTimeInput(night)}.`,
      );
    } catch (e) {
      setWindowError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingWindow(false);
    }
  }

  async function handleResetThemeWindow() {
    if (savingWindow) return;
    setWindowError(null);
    setWindowSuccess(null);
    setSavingWindow(true);
    try {
      await updatePreferences({
        token,
        themeDayStartMinutes: null,
        themeNightStartMinutes: null,
      });
      setWindowSuccess("Reverted to default day/night times.");
    } catch (e) {
      setWindowError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingWindow(false);
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
                Drives bedtime/wake estimates, the status clock, and (in auto mode)
                Follower day/night theme + audio.
              </p>
              <div className="mt-2 grid gap-1 text-sm text-[var(--ink-3)]">
                <span>
                  Saved: {savedTimeZone ?? "Not set yet"}
                  {savedSource ? ` (${savedSource})` : ""}
                </span>
                {detectedTimeZone ? <span>This device: {detectedTimeZone}</span> : null}
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <label
              htmlFor="traveler-tz-select"
              className="text-sm font-medium text-[var(--ink-2)]"
            >
              Change timezone
            </label>
            <select
              id="traveler-tz-select"
              value={selection}
              onChange={(e) => {
                setSelection(e.target.value);
                setError(null);
                setSuccess(null);
              }}
              disabled={saving}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2 text-sm text-[var(--ink-1)]"
            >
              <option value="">Choose…</option>
              <option value={SELECT_DEVICE}>
                {detectedTimeZone
                  ? `Use this device's timezone (${detectedTimeZone})`
                  : "Use this device's timezone"}
              </option>
              <optgroup label="Common timezones">
                {CURATED_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </optgroup>
              <option value={SELECT_OTHER}>Other (type IANA name)…</option>
            </select>

            {selection === SELECT_OTHER ? (
              <input
                type="text"
                value={customTz}
                onChange={(e) => {
                  setCustomTz(e.target.value);
                  setError(null);
                  setSuccess(null);
                }}
                placeholder="e.g. America/Argentina/Buenos_Aires"
                disabled={saving}
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2 text-sm text-[var(--ink-1)]"
              />
            ) : null}

            <Button
              type="button"
              variant="outline"
              disabled={applyDisabled}
              onClick={handleApplyChoice}
              className="w-full sm:w-fit"
            >
              {saving ? "Saving…" : autoEnabled ? "Apply (rebases Auto State)" : "Apply"}
            </Button>
            {autoEnabled ? (
              <p className="text-xs text-[var(--ink-3)]">
                Auto State is on — changing the timezone will rebase your energy and stomach
                estimates so they stay continuous.
              </p>
            ) : null}
          </div>

          {error ? <p className="text-xs text-[var(--ink-danger)]" role="alert">{error}</p> : null}
          {success ? <p className="text-xs text-[var(--green-2)]" role="status">{success}</p> : null}

          <div className="grid gap-2 border-t border-[var(--line-soft)] pt-4">
            <div>
              <p className="text-base font-semibold text-[var(--ink-1)]">Day &amp; Night times</p>
              <p className="text-sm text-[var(--ink-3)]">
                When the theme + audio switch between Meadow (day) and Constellation (night),
                in your timezone. Independent from Auto State bedtime/wake (which model when
                you actually sleep).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--ink-2)]">Day starts at</span>
                <input
                  type="time"
                  value={dayInput}
                  onChange={(e) => {
                    setDayInput(e.target.value);
                    setWindowError(null);
                    setWindowSuccess(null);
                  }}
                  disabled={savingWindow}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2 text-sm text-[var(--ink-1)]"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--ink-2)]">Night starts at</span>
                <input
                  type="time"
                  value={nightInput}
                  onChange={(e) => {
                    setNightInput(e.target.value);
                    setWindowError(null);
                    setWindowSuccess(null);
                  }}
                  disabled={savingWindow}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2 text-sm text-[var(--ink-1)]"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={savingWindow}
                onClick={handleSaveThemeWindow}
              >
                {savingWindow ? "Saving…" : "Save day/night times"}
              </Button>
              {isThemeWindowExplicit ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={savingWindow}
                  onClick={handleResetThemeWindow}
                >
                  Use defaults ({minutesToTimeInput(DEFAULT_THEME_DAY_START_MINUTES)} /{" "}
                  {minutesToTimeInput(DEFAULT_THEME_NIGHT_START_MINUTES)})
                </Button>
              ) : (
                <span className="self-center text-xs text-[var(--ink-3)]">
                  Currently using defaults.
                </span>
              )}
            </div>
            {windowError ? (
              <p className="text-xs text-[var(--ink-danger)]" role="alert">{windowError}</p>
            ) : null}
            {windowSuccess ? (
              <p className="text-xs text-[var(--green-2)]" role="status">{windowSuccess}</p>
            ) : null}
          </div>
        </div>
      </OptionsGroup>
    </OptionsSection>
  );
}

function AppearanceSection() {
  const theme = useTheme();
  const { mode, setMode, resolvedTheme } = theme;

  return (
    <OptionsSection label="Appearance">
      <OptionsGroup>
        <div className="grid gap-3 p-4 sm:p-5">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setMode("meadow")}
              aria-pressed={mode === "meadow"}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-semibold transition-all",
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
              aria-pressed={mode === "constellation"}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-semibold transition-all",
                mode === "constellation"
                  ? "bg-[var(--ink-1)] text-[var(--bg-paper)] shadow-sm"
                  : "bg-[var(--meter-track)] text-[var(--ink-2)] hover:bg-[var(--bg-card)]",
              )}
            >
              <Moon className="h-4 w-4" aria-hidden />
              Dark
            </button>
            <button
              type="button"
              onClick={() => setMode("auto")}
              aria-pressed={mode === "auto"}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-semibold transition-all",
                mode === "auto"
                  ? "bg-[var(--ink-1)] text-[var(--bg-paper)] shadow-sm"
                  : "bg-[var(--meter-track)] text-[var(--ink-2)] hover:bg-[var(--bg-card)]",
              )}
            >
              <SunMoon className="h-4 w-4" aria-hidden />
              Auto
            </button>
          </div>
          {mode === "auto" ? (
            <p className="text-center text-xs font-medium text-[var(--ink-3)]">
              Using {resolvedTheme === "meadow" ? "Light" : "Dark"} mode based on the Traveler's local day/night time.
            </p>
          ) : null}
        </div>
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

function ConvexUsageRow() {
  const bytes = useEgressEstimateBytes();
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:px-5">
      <div className="flex items-center gap-4">
        <OptionsIcon icon={Database} />
        <div className="min-w-0 flex-1">
          <div className="text-base font-medium text-[var(--ink-1)]">Convex data this month</div>
          <div className="text-sm text-[var(--ink-3)]">≈ {mb} MB image data loaded on this device</div>
        </div>
      </div>
      <div className="rounded-lg bg-[var(--meter-track)]/60 px-3 py-2 text-xs text-[var(--ink-3)]">
        Per-device estimate (story images only). Map tiles no longer use Convex. Authoritative total
        is in the Convex dashboard.
      </div>
    </div>
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
  const samplerMode = useSamplerMode();
  const fixOverlayEnabled = useFixOverlayEnabled();
  const fallbackTimeZone = detectBrowserTimeZone() ?? "UTC";
  const preferences = useQuery(tripcastApi.travelerPreferences.travelerGetPreferences, { token });
  const status = useQuery(tripcastApi.liveTrail.travelerGetLiveTrailStatus, { token });
  const setEnabled = useMutation(tripcastApi.liveTrail.travelerSetLiveTrailEnabled);
  const setVisibility = useMutation(tripcastApi.liveTrail.travelerSetLiveTrailVisibility);
  const deleteRange = useMutation(tripcastApi.liveTrail.travelerDeleteLiveTrailRange);
  const deleteSamples = useMutation(tripcastApi.liveTrail.travelerDeleteLiveTrailSamples);

  const timeZone = preferences?.travelerTimeZone ?? fallbackTimeZone;
  const [startDate, setStartDate] = useState(() => formatDateInputValue(Date.now(), fallbackTimeZone));
  const [startTime, setStartTime] = useState(() => "00:00");
  const [endDate, setEndDate] = useState(() => formatDateInputValue(Date.now(), fallbackTimeZone));
  const [endTime, setEndTime] = useState(() => "23:59");
  const [savingField, setSavingField] = useState<"enabled" | "visibility" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState<LiveTrailDeleteMode>("range");
  const [individualSelection, setIndividualSelection] = useState<Record<string, boolean>>({});

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
  const previewSamples = useMemo(
    () => [...(preview?.samples ?? [])].sort((a, b) => a.sampledAt - b.sampledAt),
    [preview?.samples],
  );
  const selectedSampleIds = useMemo(() => {
    if (deleteMode === "range") return previewSamples.map((sample) => sample._id);
    if (deleteMode === "every_other") {
      if (previewSamples.length <= 2) return [];
      return previewSamples
        .filter((_, index) => index > 0 && index < previewSamples.length - 1 && index % 2 === 1)
        .map((sample) => sample._id);
    }
    return previewSamples
      .filter((sample) => individualSelection[sample._id] === true)
      .map((sample) => sample._id);
  }, [deleteMode, individualSelection, previewSamples]);
  const selectedSampleIdSet = useMemo(() => new Set(selectedSampleIds), [selectedSampleIds]);
  const selectedCount = deleteMode === "range" ? previewCount : selectedSampleIds.length;

  useEffect(() => {
    setIndividualSelection({});
  }, [combinedStart, combinedEnd, deleteMode]);

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
    if (savingField || !rangeIsValid || selectedCount === 0) return;
    setSavingField("delete");
    setError(null);
    log.logInteraction("live-trail:delete-range:confirm", {
      startDate: combinedStart,
      endDate: combinedEnd,
      timeZone,
      previewCount,
      selectedCount,
      deleteMode,
    });
    try {
      const result = deleteMode === "range"
        ? await deleteRange({
          token,
          startDate: combinedStart,
          endDate: combinedEnd,
          timeZone,
        })
        : await deleteSamples({ token, sampleIds: selectedSampleIds });
      log.logInteraction("live-trail:delete-range:result", {
        deleted: result.deleted,
        ok: true,
        deleteMode,
      });
      setIndividualSelection({});
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
          <div className="flex flex-col gap-3 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-4">
              <OptionsIcon icon={Zap} />
              <div className="min-w-0 flex-1">
                <div className="text-base font-medium text-[var(--ink-1)]">Sampler</div>
                <div className="text-sm text-[var(--ink-3)]">Controls how often breadcrumbs are saved.</div>
              </div>
            </div>
            <OptionsSegmentedControl
              value={samplerMode}
              options={[
                { value: "legacy", label: "Legacy" },
                { value: "relevant", label: "Relevant" },
                { value: "precise", label: "Precise" },
              ]}
              onChange={(value) => setSamplerMode(value as SamplerMode)}
            />
            <div className="rounded-lg bg-[var(--meter-track)]/60 px-3 py-2 text-xs text-[var(--ink-3)]">
              {SAMPLER_MODE_INFO[samplerMode]}
            </div>
          </div>
          <OptionsSwitchRow
            icon={Bug}
            title="Show GPS Fix Overlay"
            detail="Green = emitted breadcrumb. Red = rejected by sampler. Clears after 30 minutes."
            checked={fixOverlayEnabled}
            onChange={setFixOverlayEnabled}
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
              <label
                htmlFor="live-trail-delete-mode"
                className="text-sm font-semibold text-[var(--ink-1)]"
              >
                Delete mode
              </label>
              <select
                id="live-trail-delete-mode"
                value={deleteMode}
                onChange={(event) => setDeleteMode(event.target.value as LiveTrailDeleteMode)}
                className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-1)]"
              >
                <option value="range">Delete all breadcrumbs in Range</option>
                <option value="every_other">Delete every other breadcrumb in range</option>
                <option value="individual">Delete individual breadcrumbs</option>
              </select>
            </div>

            <div className="grid gap-2">
              <LiveTrailPreviewMap samples={previewSamples} deletingIds={selectedSampleIdSet} log={log} />
              <p className="text-sm text-[var(--ink-3)]" aria-live="polite">
                {!rangeIsValid
                  ? "Choose an end time after the start time."
                  : preview
                    ? `${selectedCount} of ${previewCount} breadcrumb${previewCount === 1 ? "" : "s"} selected in ${timeZone}.`
                    : `Loading preview in ${timeZone}...`}
              </p>
            </div>

            {deleteMode === "individual" && previewSamples.length > 0 ? (
              <div className="max-h-52 overflow-auto rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)]">
                {previewSamples.map((sample, index) => (
                  <label
                    key={sample._id}
                    className="flex items-center gap-3 border-b border-[var(--line-soft)] px-3 py-2 text-sm last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={individualSelection[sample._id] === true}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setIndividualSelection((current) => ({
                          ...current,
                          [sample._id]: checked,
                        }));
                      }}
                    />
                    <span className="flex-1 text-[var(--ink-1)]">
                      #{index + 1} · {dayjs(sample.sampledAt).tz(timeZone).format("MMM D, h:mm A")}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}

            <Button
              type="button"
              variant="destructive"
              disabled={!rangeIsValid || selectedCount === 0 || savingField === "delete"}
              onClick={() => void handleDeleteRange()}
              className="w-full sm:w-fit"
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              {savingField === "delete" ? "Deleting..." : `Delete ${selectedCount} breadcrumb${selectedCount === 1 ? "" : "s"}`}
            </Button>

            {error ? <p className="text-xs text-[var(--ink-danger)]" role="alert">{error}</p> : null}
          </div>
        </OptionsGroup>
      </OptionsSection>
    </div>
  );
}

function LiveTrailPreviewMap({
  samples,
  deletingIds,
  log,
}: {
  samples: LiveTrailPreviewSample[];
  deletingIds: Set<string>;
  log: DebugLogger;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const { resolvedMapBase, resolvedTheme } = useTheme();
  const lineColor = resolvedTheme === "constellation" ? "#ffd86a" : "#d92332";
  const retainedColor = "#8a8f98";

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
        properties: { kind: "line", selected: sorted.every((s) => deletingIds.has(s._id)) },
        geometry: {
          type: "LineString",
          coordinates: sorted.map((s) => [s.lon, s.lat]),
        },
      });
    }

    sorted.forEach((s) => {
      features.push({
        type: "Feature",
        properties: { kind: "point", selected: deletingIds.has(s._id) },
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
              "line-color": ["case", ["==", ["get", "selected"], true], lineColor, retainedColor],
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
              "circle-color": ["case", ["==", ["get", "selected"], true], "#ffffff", retainedColor],
              "circle-stroke-color": ["case", ["==", ["get", "selected"], true], lineColor, retainedColor],
              "circle-stroke-width": 2,
            },
          });
        } else {
          log.logMap("minimap:layers:update");
          (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson);
          map.setPaintProperty(lineLayerId, "line-color", ["case", ["==", ["get", "selected"], true], lineColor, retainedColor]);
          map.setPaintProperty(pointLayerId, "circle-color", ["case", ["==", ["get", "selected"], true], "#ffffff", retainedColor]);
          map.setPaintProperty(pointLayerId, "circle-stroke-color", ["case", ["==", ["get", "selected"], true], lineColor, retainedColor]);
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
  }, [samples, deletingIds, lineColor, retainedColor, log, mapLoaded]);

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
  onTriggerTestToast,
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
          ) : view === "trip-ticker" ? (
            <SubViewHeader
              title="Trip Ticker"
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
          ) : view === "follower-cutoff" ? (
            <SubViewHeader
              title="Follower content cutoff"
              onBack={() => { music.sfx("page"); navigateTo("options"); }}
            />
          ) : view === "quick-activities" ? (
            <SubViewHeader
              title="Quick Activities"
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
          ) : view === "trip-ticker" ? (
            <SheetBody className="p-0">
              <OptionsContentFrame className="py-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                <TripTickerSettings token={session.token} />
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
          ) : view === "follower-cutoff" ? (
            <SheetBody className="p-0">
              <OptionsContentFrame className="py-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                <FollowerCutoffSection token={session.token} log={log} />
              </OptionsContentFrame>
            </SheetBody>
          ) : view === "quick-activities" ? (
            <SheetBody className="p-0">
              <OptionsContentFrame className="py-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                <QuickActivitySettingsView token={session.token} />
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
              onTripTicker={() => { music.sfx("page"); navigateTo("trip-ticker"); }}
              onCloakingPins={() => { music.sfx("page"); navigateTo("cloaking-pins"); }}
              onBulkImport={() => { music.sfx("page"); navigateTo("bulk-import"); }}
              onBulkExport={() => { music.sfx("page"); navigateTo("bulk-export"); }}
              onEmergencyReset={() => { music.sfx("page"); navigateTo("emergency-reset"); }}
              onFollowerCutoff={() => { music.sfx("page"); navigateTo("follower-cutoff"); }}
              onQuickActivities={() => { music.sfx("page"); navigateTo("quick-activities"); }}
              onDebugLogs={() => { music.sfx("page"); navigateTo("debug-logs"); }}
              onTriggerTestToast={onTriggerTestToast}
              onEndTrip={onEndTrip ? () => { music.sfx("page"); handleOpenChange(false); onEndTrip(); } : undefined}
              onViewCredits={onViewCredits ? () => { music.sfx("page"); handleOpenChange(false); onViewCredits(); } : undefined}
            />
          ) : view === "debug-logs" ? (
            <SheetBody className="min-h-0 overflow-hidden p-0">
              <DebugPanel 
                onBack={() => { music.sfx("page"); navigateTo("options"); }} 
                token={session?.token}
              />
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
  onTripTicker,
  onCloakingPins,
  onBulkImport,
  onBulkExport,
  onEmergencyReset,
  onFollowerCutoff,
  onQuickActivities,
  onDebugLogs,
  onTriggerTestToast,
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
  onTripTicker: () => void;
  onCloakingPins: () => void;
  onDebugLogs: () => void;
  onBulkImport: () => void;
  onBulkExport: () => void;
  onEmergencyReset: () => void;
  onFollowerCutoff: () => void;
  onQuickActivities: () => void;
  onTriggerTestToast?: () => void;
  onEndTrip?: () => void;
  onViewCredits?: () => void;
}) {
  const developerSection = (
    <OptionsSection label="Developer">
      <OptionsGroup>
        <ConvexUsageRow />
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
        {role === "traveler" && onTriggerTestToast ? (
          <OptionsRow
            icon={Bell}
            title="Trigger Test Toast"
            detail="Show a generic notification to verify UI positioning"
            onClick={() => {
              log.logUi("action:options:trigger-test-toast");
              onTriggerTestToast();
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
                icon={UserRoundPen}
                title="Quick Activities"
                detail="Customize the activity buttons in the status panel"
                onClick={() => {
                  log.logUi("action:quick-activities-settings");
                  onQuickActivities();
                }}
              />
            ) : null}
            {role === "traveler" ? (
              <OptionsRow
                icon={Bell}
                title="Trip Ticker"
                detail="Persistent scrolling notices, fun facts, and tips"
                onClick={() => {
                  log.logUi("action:trip-ticker-settings");
                  onTripTicker();
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
        <>
          <OptionsSection label="Privacy">
            <OptionsGroup>
              <OptionsRow
                icon={Shield}
                title="Follower content cutoff"
                detail="Hide older trip content from Followers"
                onClick={() => {
                  log.logUi("action:follower-cutoff");
                  onFollowerCutoff();
                }}
              />
            </OptionsGroup>
          </OptionsSection>

          <OptionsSection label={TERMS.dangerZone}>
            <OptionsGroup>
              <OptionsRow icon={ShieldAlert} title={TERMS.emergencyReset} detail="Wipe shared trip data" danger onClick={onEmergencyReset} />
            </OptionsGroup>
          </OptionsSection>
        </>
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

export function SoundSection() {
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
                {music.mute
                  ? "Audio disabled"
                  : `Now Playing: ${
                      music.nowPlaying
                        ? SOUNDTRACK_OPTIONS.find((option) => option.value === music.nowPlaying)?.label ?? "—"
                        : "—"
                    }`}
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
            {SOUNDTRACK_OPTIONS.map((option) => {
              const isSelected = music.soundtrack === option.value;
              const isAutoRouting =
                music.soundtrack === "auto" && music.nowPlaying === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    music.sfx("tap");
                    music.setSoundtrack(option.value);
                  }}
                  className={cn(
                    "min-h-11 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors",
                    isSelected
                      ? "border-[var(--ink-1)] bg-[var(--ink-1)] text-[var(--bg-paper)]"
                      : "border-[var(--line-soft)] bg-[var(--bg-paper)] text-[var(--ink-2)] hover:bg-[var(--meter-track)]",
                    isAutoRouting && "ring-2 ring-[var(--flag)]/40",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
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

function TickerBulkImportSheet({
  open,
  onOpenChange,
  token,
  kind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  kind: "fact" | "tip";
}) {
  const [text, setText] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const commitBulkImport = useMutation(tripcastApi.bulkImport.travelerBulkImport);
  const music = useMusicSafe();
  const labels = kind === "tip"
    ? { title: "Bulk Import Tips", noun: "tips", singular: "Tip", entryKind: "ticker_tip" as const, placeholder: "Tip 1\nTip 2\nTip 3..." }
    : { title: "Bulk Import Fun Facts", noun: "fun facts", singular: "Fact", entryKind: "ticker_fact" as const, placeholder: "Fact 1\nFact 2\nFact 3..." };

  const handleImport = async () => {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;

    setIsImporting(true);
    setErrorMessage(null);
    try {
      const entries = lines.map(line => ({
        kind: labels.entryKind,
        text: line
      }));
      await commitBulkImport({ token, entries });
      music.sfx("success");
      onOpenChange(false);
      setText("");
    } catch (e) {
      console.error("Bulk import failed", e);
      const detail = e instanceof Error && e.message ? e.message : "Check console for details.";
      setErrorMessage(`Import failed. ${detail}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setErrorMessage(null);
        onOpenChange(next);
      }}
    >
      <SheetContent side="bottom" className="h-[80dvh]">
        <SheetTitle>{labels.title}</SheetTitle>
        <SheetCloseButton />
        <SheetBody className="flex flex-col gap-4 p-4">
          <p className="text-sm text-[var(--ink-2)]">
            Paste a list of {labels.noun}, one per line. They will be added to your trip ticker.
          </p>
          <textarea
            className="flex-1 w-full p-3 text-sm rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] text-[var(--ink-1)] font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
            placeholder={labels.placeholder}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (errorMessage) setErrorMessage(null);
            }}
            disabled={isImporting}
          />
          {errorMessage ? (
            <p role="alert" className="text-sm font-medium text-rose-600 dark:text-rose-400">
              {errorMessage}
            </p>
          ) : null}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={isImporting}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleImport}
              disabled={isImporting || !text.trim()}
            >
              {isImporting ? "Importing..." : `Import ${text.split("\n").filter(l => l.trim()).length} ${labels.singular}s`}
            </Button>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function TickerWeightRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const inputId = `ticker-weight-${label.toLowerCase().replaceAll(" ", "-")}`;
  const displayValue = Number.isFinite(value) ? value : 1;
  return (
    <div className="grid gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <label className="text-sm font-semibold text-[var(--ink-1)]" htmlFor={inputId}>
          {label}
        </label>
        <span className="rounded-md border border-[var(--line-soft)] bg-[var(--bg-paper-2)] px-2 py-1 font-[var(--font-mono)] text-xs font-bold text-[var(--ink-2)]">
          {displayValue === 0 ? "Off" : displayValue}
        </span>
      </div>
      <input
        id={inputId}
        type="range"
        min={0}
        max={5}
        step={1}
        value={displayValue}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--brand)]"
      />
      <p className="text-xs text-[var(--ink-3)]">0 = Off</p>
    </div>
  );
}

export function TripTickerSettings({ token }: { token: string }) {
  const {
    settings,
    updateSettings,
    addPriorityMessage,
    removePriorityMessage,
    addFunFact,
    removeFunFact,
    addTip,
    removeTip,
    clearAll,
  } = useTicker(token);
  const [priorityInput, setPriorityInput] = useState("");
  const [funFactInput, setFunFactInput] = useState("");
  const [tipInput, setTipInput] = useState("");
  const [bulkImportKind, setBulkImportKind] = useState<"fact" | "tip" | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const confirmingClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmingClearTimeoutRef.current !== null) {
        clearTimeout(confirmingClearTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="grid gap-8">
      <OptionsSection label="Preview">
        <OptionsGroup>
          <div className="p-4 bg-[var(--bg-paper-2)]/30 rounded-lg overflow-hidden">
            <TripTicker
              message={TICKER_PREVIEW_MESSAGE}
              isPriority={false}
              className="border rounded shadow-inner"
            />
          </div>
        </OptionsGroup>
      </OptionsSection>

      <OptionsSection label="General">
        <OptionsGroup>
          <OptionsSwitchRow
            title="Enable Ticker"
            detail="Show the scrolling banner below the top bar."
            checked={settings.enabled}
            onChange={(checked) => updateSettings({ enabled: checked })}
          />
        </OptionsGroup>
      </OptionsSection>

      <OptionsSection label="Alerts">
        <p className="text-xs text-[var(--ink-3)] mb-2">
          Alerts loop continuously and take precedence over fun facts and tips.
        </p>
        <OptionsGroup>
          <div className="p-4 sm:p-5 flex gap-2">
            <input
              type="text"
              value={priorityInput}
              onChange={(e) => setPriorityInput(e.target.value)}
              placeholder="Alert text (e.g. Low reception ahead)"
              className="flex-1 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-1)]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && priorityInput.trim()) {
                  addPriorityMessage(priorityInput.trim());
                  setPriorityInput("");
                }
              }}
            />
            <Button
              size="sm"
              onClick={() => {
                if (priorityInput.trim()) {
                  addPriorityMessage(priorityInput.trim());
                  setPriorityInput("");
                }
              }}
            >
              Add
            </Button>
          </div>
          {settings.priorityMessages.map((msg) => (
            <div key={msg.id} className="flex items-center gap-4 px-4 py-3 sm:px-5">
              <span className="flex-1 text-sm text-[var(--ink-1)]">{msg.text}</span>
              <button
                type="button"
                onClick={() => removePriorityMessage(msg.id)}
                className="text-[var(--ink-3)] hover:text-[var(--ink-danger)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </OptionsGroup>
      </OptionsSection>

      <OptionsSection label="Ticker Timing">
        <OptionsGroup>
          <div className="p-4 sm:p-5">
            <label className="grid gap-2 text-sm font-semibold text-[var(--ink-1)]">
              Minutes between ticker items
              <select
                value={settings.funFactIntervalMinutes}
                onChange={(e) => updateSettings({ funFactIntervalMinutes: Number(e.target.value) })}
                className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-1)]"
              >
                {[0, 1, 2, 5, 10, 20, 30, 60].map(m => (
                  <option key={m} value={m}>{m} minutes</option>
                ))}
              </select>
            </label>
          </div>
        </OptionsGroup>
      </OptionsSection>

      <OptionsSection label="Ticker Mix">
        <OptionsGroup>
          <TickerWeightRow
            label="Fun Facts rate"
            value={settings.funFactWeight}
            onChange={(value) => updateSettings({ funFactWeight: value })}
          />
          <TickerWeightRow
            label="Tips rate"
            value={settings.tipWeight}
            onChange={(value) => updateSettings({ tipWeight: value })}
          />
        </OptionsGroup>
      </OptionsSection>

      <OptionsSection label="Fun Facts">
        <OptionsGroup>
          <OptionsSwitchRow
            title="Enable Fun Facts"
            detail="Show random trivia when no alerts exist."
            checked={settings.funFactsEnabled}
            onChange={(checked) => updateSettings({ funFactsEnabled: checked })}
          />
          <OptionsSwitchRow
            title="Show Fun Facts to Followers"
            detail="Allow Followers to see fun facts in the ticker."
            checked={settings.showFunFactsToFollowers}
            onChange={(checked) => updateSettings({ showFunFactsToFollowers: checked })}
          />
          <div className="p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={funFactInput}
                onChange={(e) => setFunFactInput(e.target.value)}
                placeholder="Fun fact text..."
                className="flex-1 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-1)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && funFactInput.trim()) {
                    addFunFact(funFactInput.trim());
                    setFunFactInput("");
                  }
                }}
              />
              <Button
                size="sm"
                onClick={() => {
                  if (funFactInput.trim()) {
                    addFunFact(funFactInput.trim());
                    setFunFactInput("");
                  }
                }}
              >
                Add
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setBulkImportKind("fact")}
            >
              Bulk Import Fun Facts
            </Button>
          </div>
          {settings.funFacts.map((msg) => (
            <div key={msg.id} className="flex items-center gap-4 px-4 py-3 sm:px-5">
              <span className="flex-1 text-sm text-[var(--ink-1)]">{msg.text}</span>
              <button
                type="button"
                onClick={() => removeFunFact(msg.id)}
                className="text-[var(--ink-3)] hover:text-[var(--ink-danger)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </OptionsGroup>
      </OptionsSection>

      <OptionsSection label="Tips">
        <OptionsGroup>
          <OptionsSwitchRow
            title="Enable Tips"
            detail="Show trip tips when no alerts exist."
            checked={settings.tipsEnabled}
            onChange={(checked) => updateSettings({ tipsEnabled: checked })}
          />
          <OptionsSwitchRow
            title="Show Tips to Followers"
            detail="Allow Followers to see tips in the ticker."
            checked={settings.showTipsToFollowers}
            onChange={(checked) => updateSettings({ showTipsToFollowers: checked })}
          />
          <div className="p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={tipInput}
                onChange={(e) => setTipInput(e.target.value)}
                placeholder="Tip text..."
                className="flex-1 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-1)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tipInput.trim()) {
                    addTip(tipInput.trim());
                    setTipInput("");
                  }
                }}
              />
              <Button
                size="sm"
                onClick={() => {
                  if (tipInput.trim()) {
                    addTip(tipInput.trim());
                    setTipInput("");
                  }
                }}
              >
                Add
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setBulkImportKind("tip")}
            >
              Bulk Import Tips
            </Button>
          </div>
          {settings.tips.map((msg) => (
            <div key={msg.id} className="flex items-center gap-4 px-4 py-3 sm:px-5">
              <span className="flex-1 text-sm text-[var(--ink-1)]">{msg.text}</span>
              <button
                type="button"
                onClick={() => removeTip(msg.id)}
                className="text-[var(--ink-3)] hover:text-[var(--ink-danger)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </OptionsGroup>
      </OptionsSection>

      <TickerBulkImportSheet
        open={bulkImportKind !== null}
        onOpenChange={(open) => {
          if (!open) setBulkImportKind(null);
        }}
        token={token}
        kind={bulkImportKind ?? "fact"}
      />

      <OptionsSection label="Danger Zone">
        <OptionsGroup>
          <div className="p-4 sm:p-5 grid gap-2">
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                if (!confirmingClear) {
                  setConfirmingClear(true);
                  if (confirmingClearTimeoutRef.current !== null) {
                    clearTimeout(confirmingClearTimeoutRef.current);
                  }
                  confirmingClearTimeoutRef.current = setTimeout(() => {
                    setConfirmingClear(false);
                    confirmingClearTimeoutRef.current = null;
                  }, 4000);
                  return;
                }
                if (confirmingClearTimeoutRef.current !== null) {
                  clearTimeout(confirmingClearTimeoutRef.current);
                  confirmingClearTimeoutRef.current = null;
                }
                setConfirmingClear(false);
                void clearAll();
              }}
            >
              {confirmingClear ? "Tap again to confirm clear" : "Clear all messages"}
            </Button>
            {confirmingClear ? (
              <p className="text-xs text-[var(--ink-3)] text-center">
                This removes every alert, fun fact, and tip.
              </p>
            ) : null}
          </div>
        </OptionsGroup>
      </OptionsSection>
    </div>
  );
}

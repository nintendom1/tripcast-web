import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import {
  getProvisioningProfileDiagnostics,
  isNativeIos,
  type ActivityProfileDiagnostics,
  type ProvisioningProfileDiagnostics,
} from "../../native/provisioningProfile";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export type CountdownTone = "healthy" | "warning" | "critical";

export function getCountdownTone(remainingMs: number): CountdownTone {
  if (remainingMs <= DAY_MS) return "critical";
  if (remainingMs <= 2 * DAY_MS) return "warning";
  return "healthy";
}

export function formatRemainingTime(remainingMs: number): string {
  if (remainingMs <= 0) return "Expired";

  let remainingMinutes = Math.ceil(remainingMs / MINUTE_MS);
  const days = Math.floor(remainingMinutes / (24 * 60));
  remainingMinutes -= days * 24 * 60;
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes - hours * 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours > 0 || days > 0) {
    parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  }
  parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  return parts.join(", ");
}

export function formatExpirationDate(
  expiresAtMs: number,
  locale?: string,
  timeZone?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(expiresAtMs));
}

export function SideloadProfileCountdownRow({
  expiresAtMs,
  activityProfile,
  nowMs,
  locale,
  timeZone,
}: {
  expiresAtMs: number | null;
  activityProfile?: ActivityProfileDiagnostics;
  nowMs: number;
  locale?: string;
  timeZone?: string;
}) {
  const remainingMs = expiresAtMs === null ? Infinity : expiresAtMs - nowMs;
  const expired = remainingMs <= 0;
  const tone = expiresAtMs === null ? null : getCountdownTone(remainingMs);
  const expirationLabel = expiresAtMs === null ? null : formatExpirationDate(
    expiresAtMs,
    locale,
    timeZone,
  );
  const earliestExpiration = expiresAtMs !== null && activityProfile?.expiresAtMs != null
    ? Math.min(expiresAtMs, activityProfile.expiresAtMs) : null;
  const earliestTone = earliestExpiration === null ? null : getCountdownTone(earliestExpiration - nowMs);

  return (
    <div className="flex min-h-16 items-center gap-4 px-4 py-3 sm:px-5">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--meter-track)] text-[var(--ink-2)]">
        <Clock className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-[var(--ink-1)]">
          Sideload Profile
        </p>
        {earliestExpiration !== null && <p className={cn("text-xs font-semibold",
          earliestTone === "warning" && "text-[var(--amber-2)]",
          earliestTone === "critical" && "text-[var(--danger)]")}>
          {earliestExpiration <= nowMs ? "Renewal needed" : `Renew both before ${formatExpirationDate(earliestExpiration, locale, timeZone)}`}
        </p>}
        <p className="mt-2 text-xs font-semibold text-[var(--ink-2)]">App</p>
        <p
          className={cn(
            "text-sm font-medium",
            tone === "healthy" && "text-[var(--green-2)]",
            tone === "warning" && "font-semibold text-[var(--amber-2)]",
            tone === "critical" && "font-semibold text-[var(--danger)]",
          )}
        >
          {expiresAtMs === null ? "Profile information unavailable" : expired
            ? "Expired"
            : `${formatRemainingTime(remainingMs)} remaining`}
        </p>
        {expirationLabel && <p className="text-xs text-[var(--ink-3)]">
          {expired ? "Expired" : "Expires"} {expirationLabel}
        </p>}
        <ActivityProfileDetails profile={activityProfile} nowMs={nowMs} locale={locale} timeZone={timeZone} />
      </div>
    </div>
  );
}

function ActivityProfileDetails({ profile, nowMs, locale, timeZone }: {
  profile?: ActivityProfileDiagnostics;
  nowMs: number;
  locale?: string;
  timeZone?: string;
}) {
  const expiration = profile?.expiresAtMs;
  const remaining = expiration == null ? null : expiration - nowMs;
  const tone = remaining === null ? null : getCountdownTone(remaining);
  return (
    <div className="mt-3 border-t border-[var(--line-soft)] pt-2">
      <p className="text-xs font-semibold text-[var(--ink-2)]">Lock Screen activity</p>
      <p className={cn("text-sm font-medium", tone === "healthy" && "text-[var(--green-2)]",
        tone === "warning" && "text-[var(--amber-2)]", tone === "critical" && "text-[var(--danger)]")}>
        {remaining !== null
          ? remaining <= 0 ? "Expired" : `${formatRemainingTime(remaining)} remaining`
          : profile?.extensionPresent === false ? "Extension missing"
            : profile?.status === "missing" ? "Profile missing"
              : profile?.status === "unreadable" ? "Profile could not be read" : "Profile information unavailable"}
      </p>
      {expiration != null && <p className="text-xs text-[var(--ink-3)]">
        {remaining !== null && remaining <= 0 ? "Expired" : "Expires"} {formatExpirationDate(expiration, locale, timeZone)}
      </p>}
      {remaining !== null && remaining <= 0 && <p className="mt-1 text-xs text-[var(--ink-2)]">
        Renew and reinstall TripCast from your Mac. Changing iOS permissions cannot renew this profile.
      </p>}
    </div>
  );
}

export function IosSideloadProfileCountdown({
  role,
}: {
  role: "traveler" | "follower";
}) {
  const eligible = role === "traveler" && isNativeIos();
  const [profiles, setProfiles] = useState<ProvisioningProfileDiagnostics>({ expiresAtMs: null });
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    setProfiles({ expiresAtMs: null });
    if (!eligible) return () => {
      cancelled = true;
    };

    void getProvisioningProfileDiagnostics().then((result) => {
      if (!cancelled) setProfiles(result);
    });

    return () => {
      cancelled = true;
    };
  }, [eligible]);

  useEffect(() => {
    if (profiles.expiresAtMs === null && !profiles.activityProfile) return;

    const refresh = () => setNowMs(Date.now());
    const interval = window.setInterval(refresh, MINUTE_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [profiles]);

  if (!eligible || (profiles.expiresAtMs === null && !profiles.activityProfile)) return null;

  return (
    <SideloadProfileCountdownRow
      expiresAtMs={profiles.expiresAtMs}
      activityProfile={profiles.activityProfile}
      nowMs={nowMs}
    />
  );
}

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import {
  getProvisioningProfileExpiration,
  isNativeIos,
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
  nowMs,
  locale,
  timeZone,
}: {
  expiresAtMs: number;
  nowMs: number;
  locale?: string;
  timeZone?: string;
}) {
  const remainingMs = expiresAtMs - nowMs;
  const expired = remainingMs <= 0;
  const tone = getCountdownTone(remainingMs);
  const expirationLabel = formatExpirationDate(
    expiresAtMs,
    locale,
    timeZone,
  );

  return (
    <div className="flex min-h-16 items-center gap-4 px-4 py-3 sm:px-5">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--meter-track)] text-[var(--ink-2)]">
        <Clock className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-[var(--ink-1)]">
          Sideload Profile
        </p>
        <p
          className={cn(
            "text-sm font-medium",
            tone === "healthy" && "text-[var(--green-2)]",
            tone === "warning" && "font-semibold text-[var(--amber-2)]",
            tone === "critical" && "font-semibold text-[var(--danger)]",
          )}
        >
          {expired
            ? "Expired"
            : `${formatRemainingTime(remainingMs)} remaining`}
        </p>
        <p className="text-xs text-[var(--ink-3)]">
          {expired ? "Expired" : "Expires"} {expirationLabel}
        </p>
      </div>
    </div>
  );
}

export function IosSideloadProfileCountdown({
  role,
}: {
  role: "traveler" | "follower";
}) {
  const eligible = role === "traveler" && isNativeIos();
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    setExpiresAtMs(null);
    if (!eligible) return () => {
      cancelled = true;
    };

    void getProvisioningProfileExpiration().then((expiration) => {
      if (!cancelled) setExpiresAtMs(expiration);
    });

    return () => {
      cancelled = true;
    };
  }, [eligible]);

  useEffect(() => {
    if (expiresAtMs === null) return;

    const refresh = () => setNowMs(Date.now());
    const interval = window.setInterval(refresh, MINUTE_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [expiresAtMs]);

  if (!eligible || expiresAtMs === null) return null;

  return (
    <SideloadProfileCountdownRow
      expiresAtMs={expiresAtMs}
      nowMs={nowMs}
    />
  );
}

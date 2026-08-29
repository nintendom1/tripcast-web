import { CloudOff, LoaderCircle, MapPinOff, Radio, Route } from "lucide-react";

import { Button } from "../../components/ui/button";
import type { NativePublishingPhase } from "../../native/nativePublishingState";
import type { NativeTrackingMode } from "../../native/nativeTrackingState";

export type VerificationLivePhase =
  | "idle"
  | "checking"
  | "starting"
  | "active"
  | "configuration-missing"
  | "degraded";

export type SessionVerificationLiveControlProps = {
  live: boolean;
  phase: VerificationLivePhase;
  trackingMode?: NativeTrackingMode;
  publishingPhase?: NativePublishingPhase;
  pendingBreadcrumbs?: number;
  liveTrailEnabled?: boolean | null;
  onToggle: () => void;
};

function statusMessage({
  live,
  phase,
  trackingMode,
  publishingPhase,
  pendingBreadcrumbs,
  liveTrailEnabled,
}: Omit<SessionVerificationLiveControlProps, "onToggle">) {
  if (!live) return "Starts GPS now while TripCast verifies your session.";
  if (phase === "configuration-missing") {
    return "Live will start as soon as session verification finishes setting up this iPhone.";
  }
  if (phase === "degraded") {
    return "TripCast could not start GPS yet. Session verification is still continuing.";
  }
  if (phase === "checking" || phase === "starting") {
    return "Starting GPS from the settings already saved on this iPhone…";
  }
  if (publishingPhase === "offline") {
    return pendingBreadcrumbs
      ? `${pendingBreadcrumbs.toLocaleString()} breadcrumb${pendingBreadcrumbs === 1 ? " is" : "s are"} saved on this iPhone.`
      : "Live is on. New breadcrumbs will be saved on this iPhone while offline.";
  }
  if (publishingPhase === "syncing" || publishingPhase === "retrying") {
    return pendingBreadcrumbs
      ? `Sending ${pendingBreadcrumbs.toLocaleString()} saved breadcrumb${pendingBreadcrumbs === 1 ? "" : "s"}…`
      : "Live is on and reconnecting.";
  }
  if (publishingPhase === "storage-error") {
    return "Live is on, but TripCast could not save the latest breadcrumb to this iPhone.";
  }
  if (liveTrailEnabled === false) {
    return "Live location is on. Live Trail was last set to paused.";
  }
  const mode = trackingMode === "legacy"
    ? "Legacy GPS"
    : trackingMode === "power-saving"
      ? "power-saving GPS"
      : "GPS";
  return `Live is on with ${mode}. Using your saved Live Trail settings while verification finishes.`;
}

export function SessionVerificationLiveControl({
  live,
  phase,
  trackingMode = "off",
  publishingPhase = "idle",
  pendingBreadcrumbs = 0,
  liveTrailEnabled = null,
  onToggle,
}: SessionVerificationLiveControlProps) {
  const busy = live && (phase === "checking" || phase === "starting");
  const offline = live && publishingPhase === "offline";
  const degraded = live && (phase === "degraded" || publishingPhase === "storage-error");

  return (
    <section
      aria-label="Live location during session verification"
      className="grid gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-4 text-left shadow-[var(--shadow-card)]"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--meter-track)] text-[var(--flag)]">
          {degraded ? (
            <MapPinOff className="h-5 w-5" aria-hidden="true" />
          ) : offline ? (
            <CloudOff className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Radio className="h-5 w-5" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-[var(--font-display)] text-base font-bold text-[var(--ink-1)]">
              Live location
            </h2>
            {liveTrailEnabled === true ? (
              <Route className="h-4 w-4 text-[var(--green)]" aria-label="Live Trail enabled" />
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-[var(--ink-3)]" role="status">
            {statusMessage({
              live,
              phase,
              trackingMode,
              publishingPhase,
              pendingBreadcrumbs,
              liveTrailEnabled,
            })}
          </p>
        </div>
      </div>
      <Button
        type="button"
        size="lg"
        variant={live ? "outline" : "default"}
        onClick={onToggle}
        aria-pressed={live}
        className="w-full rounded-full"
      >
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {live ? "Pause Live" : "Resume Live"}
      </Button>
    </section>
  );
}

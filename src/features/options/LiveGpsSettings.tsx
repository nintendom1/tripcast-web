import { Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  setAdaptiveGpsEnabled,
  useAdaptiveGpsEnabled,
} from "../../lib/adaptiveGpsPreference";
import {
  useNativeTrackingState,
  type NativeTrackingMode,
} from "../../native/nativeTrackingState";
import {
  setStaleBreadcrumbAlertSeconds,
  useStaleBreadcrumbAlertSeconds,
  type StaleBreadcrumbAlertSeconds,
} from "../../lib/staleBreadcrumbAlertPreference";

export type LiveGpsSettingsProps = {
  previewAdaptiveEnabled?: boolean;
  previewMode?: NativeTrackingMode;
  previewAlertThresholdSeconds?: StaleBreadcrumbAlertSeconds;
};

const MODE_LABELS: Record<NativeTrackingMode, string> = {
  off: "Off",
  precise: "Precise",
  "power-saving": "Power saving",
  legacy: "Legacy",
};

const MODE_DESCRIPTIONS: Array<{ mode: NativeTrackingMode; description: string }> = [
  { mode: "off", description: "Live location sharing is off." },
  { mode: "precise", description: "Higher-accuracy tracking while moving or calibrating." },
  {
    mode: "power-saving",
    description: "Lower-power monitoring after about five stationary minutes.",
  },
  { mode: "legacy", description: "The rollback tracker used when adaptive tracking is off." },
];

export function LiveGpsSettings({
  previewAdaptiveEnabled,
  previewMode,
  previewAlertThresholdSeconds,
}: LiveGpsSettingsProps) {
  const storedAdaptiveEnabled = useAdaptiveGpsEnabled();
  const trackingState = useNativeTrackingState();
  const adaptiveEnabled = previewAdaptiveEnabled ?? storedAdaptiveEnabled;
  const mode = previewMode ?? trackingState.mode;
  const storedAlertThreshold = useStaleBreadcrumbAlertSeconds();
  const alertThreshold = previewAlertThresholdSeconds ?? storedAlertThreshold;
  const isPreview =
    previewAdaptiveEnabled !== undefined ||
    previewMode !== undefined ||
    previewAlertThresholdSeconds !== undefined;

  return (
    <div className="grid gap-6" data-live-gps-settings="">
      <div className="overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] shadow-sm">
        <label className="flex min-h-20 cursor-pointer items-center gap-4 px-4 py-4 sm:px-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--meter-track)] text-[var(--green)]">
            <Compass className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-medium text-[var(--ink-1)]">
              Adaptive Background GPS
            </span>
            <span className="block text-sm text-[var(--ink-3)]">
              Save power while you stay in one place.
            </span>
          </span>
          <input
            type="checkbox"
            checked={adaptiveEnabled}
            onChange={(event) => {
              if (!isPreview) setAdaptiveGpsEnabled(event.target.checked);
            }}
            className="sr-only"
          />
          <span
            aria-hidden="true"
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-full transition-colors",
              adaptiveEnabled ? "bg-[var(--ink-1)]" : "bg-[var(--meter-track)]",
            )}
          >
            <span
              className={cn(
                "absolute top-1 h-5 w-5 rounded-full bg-[var(--bg-card)] shadow-sm transition-transform",
                adaptiveEnabled ? "translate-x-6" : "translate-x-1",
              )}
            />
          </span>
        </label>
        <div className="flex items-center justify-between border-t border-[var(--line-soft)] px-4 py-3 sm:px-5">
          <span className="text-sm text-[var(--ink-3)]">Current mode</span>
          <span className="font-[var(--font-mono)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-1)]">
            {MODE_LABELS[mode]}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] shadow-sm">
        <div className="px-4 py-4 sm:px-5">
          <div className="text-base font-medium text-[var(--ink-1)]">Stale breadcrumb alert</div>
          <div className="mt-1 text-sm text-[var(--ink-3)]">
            Sound one iOS notification when Live cannot confirm location sharing for the selected
            time.
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Stale breadcrumb alert">
            {([
              [0, "Off"],
              [120, "2 min"],
              [180, "3 min"],
              [300, "5 min"],
            ] as const).map(([seconds, label]) => (
              <button
                key={seconds}
                type="button"
                role="radio"
                aria-checked={alertThreshold === seconds}
                className={cn(
                  "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                  alertThreshold === seconds
                    ? "border-[var(--ink-1)] bg-[var(--ink-1)] text-[var(--bg-card)]"
                    : "border-[var(--line-soft)] text-[var(--ink-2)]",
                )}
                onClick={() => {
                  if (!isPreview) {
                    setStaleBreadcrumbAlertSeconds(seconds as StaleBreadcrumbAlertSeconds);
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[var(--ink-3)]">
            Power Saving, Privacy Pause, and confidently stationary Motion &amp; Fitness activity are
            quiet when healthy. Unknown motion can still alert, and GPS or publishing errors alert
            even while stationary. Breadcrumbs stay queued during connection outages, and a server
            confirmation resets the alert.
          </p>
        </div>
      </div>

      <div className="grid gap-3 text-sm leading-relaxed text-[var(--ink-3)]">
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-2)]">Modes</div>
        <ul className="grid gap-3">
          {MODE_DESCRIPTIONS.map(({ mode: listedMode, description }) => (
            <li key={listedMode} className="grid grid-cols-[7rem_1fr] gap-3">
              <span className="font-medium text-[var(--ink-1)]">{MODE_LABELS[listedMode]}</span>
              <span>{description}</span>
            </li>
          ))}
        </ul>
        <p>
          Wake-up distance and timing are partly controlled by iOS. Force-quitting TripCast prevents
          reliable background wake-up.
        </p>
        <p>
          Changing the tracker does not turn Live off.
        </p>
      </div>
    </div>
  );
}

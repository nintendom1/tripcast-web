import { RadioTower } from "lucide-react";

export type GpsKillStatus = "stopping" | "stopped" | "unconfirmed";

type GpsKillBannerProps = {
  status: GpsKillStatus;
  secondsRemaining: number;
  onEnable: () => void;
};

export function GpsKillBanner({
  status,
  secondsRemaining,
  onEnable,
}: GpsKillBannerProps) {
  const message =
    status === "stopping"
      ? "Stopping GPS services…"
      : status === "unconfirmed"
        ? "TripCast couldn’t confirm that every GPS service stopped."
        : `GPS disabled for ${secondsRemaining}s.`;

  return (
    <div
      role="alert"
      className="pointer-events-auto flex items-center gap-3 rounded-md border border-[var(--ink-danger)] bg-[var(--bg-danger)] px-3 py-2 text-xs text-[var(--ink-danger)] shadow-[var(--shadow-card)]"
    >
      <RadioTower className="h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{message}</p>
        <p className="font-normal opacity-85">
          {status === "stopping"
            ? "LIVE stays selected while TripCast shuts location down."
            : `Automatic recovery in ${secondsRemaining}s.`}
        </p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded bg-[var(--bg-card)] px-2.5 py-1.5 font-semibold text-[var(--ink-danger)]"
        onClick={onEnable}
      >
        Enable GPS
      </button>
    </div>
  );
}

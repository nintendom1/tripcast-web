import { useDelayedPending } from "./useDelayedPending";
import { useOnlineStatus } from "./useOnlineStatus";

type PendingNoticeProps = {
  label: string;
  pending?: boolean;
  className?: string;
};

export function PendingNotice({
  label,
  pending = true,
  className = "text-sm text-muted-foreground py-4 text-center",
}: PendingNoticeProps) {
  const showDelayed = useDelayedPending(pending);
  const isOnline = useOnlineStatus();

  return (
    <div className={className}>
      <p>{label}</p>
      {showDelayed ? (
        <p className="mt-1 text-xs">
          {isOnline
            ? "Still trying to connect. This can happen when the service is slow or unavailable."
            : "Still trying. Your browser appears to be offline."}
        </p>
      ) : null}
    </div>
  );
}

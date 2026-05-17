import { useDelayedPending } from "./useDelayedPending";
import { useOnlineStatus } from "./useOnlineStatus";

type PendingActionNoticeProps = {
  isPending: boolean;
  actionLabel?: string;
};

export function PendingActionNotice({
  isPending,
  actionLabel = "request",
}: PendingActionNoticeProps) {
  const showDelayed = useDelayedPending(isPending);
  const isOnline = useOnlineStatus();

  if (!showDelayed) return null;

  return (
    <p role="status" className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
      {isOnline
        ? `Still trying to finish this ${actionLabel}. The service may be slow or unavailable.`
        : `Still trying to finish this ${actionLabel}. Your browser appears to be offline.`}
    </p>
  );
}

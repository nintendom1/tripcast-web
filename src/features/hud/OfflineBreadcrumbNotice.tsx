import { CloudOff, LoaderCircle, Save, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NativePublishingPhase } from "../../native/nativePublishingState";

export type OfflineBreadcrumbNoticeProps = {
  phase: NativePublishingPhase;
  breadcrumbCount: number;
  capacityReached?: boolean;
  className?: string;
};

export function OfflineBreadcrumbNotice({
  phase,
  breadcrumbCount,
  capacityReached = false,
  className,
}: OfflineBreadcrumbNoticeProps) {
  if (phase === "idle" || phase === "healthy") return null;

  const count = breadcrumbCount.toLocaleString();
  const isOffline = phase === "offline";
  const isSyncing = phase === "syncing";
  const isStorageError = phase === "storage-error";
  const Icon = isOffline ? CloudOff : isSyncing ? LoaderCircle : isStorageError ? TriangleAlert : Save;

  let message = isOffline
    ? breadcrumbCount === 0
      ? "Offline — not transmitting. New breadcrumbs will be saved locally."
      : `Offline — ${count} breadcrumb${breadcrumbCount === 1 ? "" : "s"} saved locally. Not transmitting.`
    : isSyncing
      ? `Back online — sending ${count} saved breadcrumb${breadcrumbCount === 1 ? "" : "s"}…`
      : isStorageError
        ? "TripCast couldn’t save the latest breadcrumbs to device storage."
        : `Sync delayed — ${count} breadcrumb${breadcrumbCount === 1 ? "" : "s"} saved locally.`;

  if (capacityReached) {
    message = "Offline breadcrumb storage is full. Oldest saved points are being replaced.";
  }

  return (
    <div
      role={isStorageError || capacityReached ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex items-center gap-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-xs font-semibold text-[var(--ink-1)] shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <Icon
        className={cn("h-4 w-4 shrink-0 text-[var(--amber)]", isSyncing && "animate-spin")}
        aria-hidden="true"
      />
      <span>{message}</span>
    </div>
  );
}

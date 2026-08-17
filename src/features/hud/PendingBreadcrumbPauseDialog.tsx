import { Dialog } from "@base-ui/react/dialog";
import { CloudUpload, Trash2 } from "lucide-react";

export type PendingBreadcrumbPauseDialogProps = {
  open: boolean;
  breadcrumbCount: number;
  onOpenChange: (open: boolean) => void;
  onKeep: () => void;
  onDiscard: () => void;
};

export function PendingBreadcrumbPauseDialog({
  open,
  breadcrumbCount,
  onOpenChange,
  onKeep,
  onDiscard,
}: PendingBreadcrumbPauseDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[101] w-[calc(100%-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-5 shadow-xl">
          <Dialog.Title className="font-[var(--font-display)] text-base font-bold text-[var(--ink-1)]">
            Pause with saved breadcrumbs?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-[var(--ink-2)]">
            {breadcrumbCount.toLocaleString()} breadcrumb{breadcrumbCount === 1 ? " is" : "s are"} saved on this iPhone and haven’t been sent yet.
          </Dialog.Description>
          <div className="mt-5 grid gap-2">
            <button
              type="button"
              onClick={() => { onKeep(); onOpenChange(false); }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--flag)] px-4 py-2 text-sm font-semibold text-white"
            >
              <CloudUpload className="h-4 w-4" aria-hidden="true" />
              Keep &amp; send when online
            </button>
            <button
              type="button"
              onClick={() => { onDiscard(); onOpenChange(false); }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--bg-danger)] px-4 py-2 text-sm font-semibold text-[var(--ink-danger)]"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete &amp; pause
            </button>
            <Dialog.Close className="min-h-11 rounded-full px-4 py-2 text-sm font-semibold text-[var(--ink-2)] hover:bg-[var(--meter-track)]">
              Cancel
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

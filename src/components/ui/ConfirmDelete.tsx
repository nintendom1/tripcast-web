import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConfirmDeleteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  itemLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
}

/**
 * ConfirmDelete is the destructive-action modal used across the rework.
 *
 * All destructive flows funnel through here — no inline confirms, no silent deletes.
 * The active theme's danger tokens drive the icon and primary button.
 */
export function ConfirmDelete({
  open,
  onOpenChange,
  title = "Delete this item?",
  description = "This can't be undone.",
  itemLabel,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  pending = false,
}: ConfirmDeleteProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Popup
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-5 shadow-xl",
            "transition duration-150 ease-out",
            "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-95 data-[starting-style]:scale-95",
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--ink-danger)]"
              style={{ background: "var(--bg-danger)" }}
            >
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex-1 space-y-1">
              <Dialog.Title className="font-[var(--font-display)] text-base font-bold text-[var(--ink-1)]">
                {title}
              </Dialog.Title>
              {itemLabel ? (
                <p className="text-sm font-semibold text-[var(--ink-1)]">{itemLabel}</p>
              ) : null}
              <Dialog.Description className="text-sm text-[var(--ink-2)]">
                {description}
              </Dialog.Description>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close
              className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--meter-track)]"
              disabled={pending}
            >
              {cancelLabel}
            </Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--bg-paper)] transition-opacity disabled:opacity-60"
              style={{ background: "var(--ink-danger)" }}
            >
              {pending ? "Deleting…" : confirmLabel}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

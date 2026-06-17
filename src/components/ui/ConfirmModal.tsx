import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  variant?: "default" | "danger";
}

/**
 * ConfirmModal is a generic confirmation dialog.
 */
export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  variant = "default",
}: ConfirmModalProps) {
  const isDanger = variant === "danger";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" />
        <Dialog.Popup
          className={cn(
            "fixed left-1/2 top-1/2 z-[101] w-[calc(100%-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-5 shadow-xl",
            "transition duration-150 ease-out",
            "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-95 data-[starting-style]:scale-95",
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                isDanger ? "text-[var(--ink-danger)]" : "text-[var(--flag)]"
              )}
              style={{ background: isDanger ? "var(--bg-danger)" : "var(--bg-paper-2)" }}
            >
              <Info className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex-1 space-y-1">
              <Dialog.Title className="font-[var(--font-display)] text-base font-bold text-[var(--ink-1)]">
                {title}
              </Dialog.Title>
              {description ? (
                <div className="text-sm text-[var(--ink-2)]">
                  {description}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close
              className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--meter-track)]"
            >
              {cancelLabel}
            </Dialog.Close>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
              className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--bg-paper)] transition-opacity hover:opacity-90"
              style={{ background: isDanger ? "var(--ink-danger)" : "var(--flag)" }}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

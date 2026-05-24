import * as React from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTION_WIDTH = 132;
const SNAP_THRESHOLD = 0.4;

export interface SwipeRowProps {
  id: string;
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  editLabel?: string;
  deleteLabel?: string;
  showEdit?: boolean;
  showDelete?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * SwipeRow exposes Edit / Delete actions either by swipe-left or a "More" button.
 *
 * The button is the accessible affordance — swipe is the discoverability layer.
 * Only one row in a list may be open at a time; the parent owns the open id.
 */
export function SwipeRow({
  id,
  openId,
  onOpenChange,
  onEdit,
  onDelete,
  editLabel = "Edit",
  deleteLabel = "Delete",
  showEdit = true,
  showDelete = true,
  className,
  children,
}: SwipeRowProps) {
  const open = openId === id;
  const [drag, setDrag] = React.useState<number | null>(null);
  const startX = React.useRef<number | null>(null);
  const pointerId = React.useRef<number | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback(() => {
    if (openId === id) {
      onOpenChange(null);
    }
  }, [id, onOpenChange, openId]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    startX.current = event.clientX;
    pointerId.current = event.pointerId;
    setDrag(0);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (startX.current === null || pointerId.current !== event.pointerId) return;
    const dx = event.clientX - startX.current;
    const clamped = Math.min(0, Math.max(-ACTION_WIDTH * 1.1, dx));
    setDrag(clamped);
  }

  function onPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (startX.current === null || pointerId.current !== event.pointerId) {
      startX.current = null;
      pointerId.current = null;
      setDrag(null);
      return;
    }
    const dx = event.clientX - startX.current;
    startX.current = null;
    pointerId.current = null;
    setDrag(null);
    if (dx < -ACTION_WIDTH * SNAP_THRESHOLD) {
      onOpenChange(id);
    } else if (dx > 16 && open) {
      onOpenChange(null);
    }
  }

  const translateX = drag !== null ? drag : open ? -ACTION_WIDTH : 0;

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
      data-swipe-row-id={id}
    >
      <div
        aria-hidden={!open}
        className="absolute inset-y-0 right-0 flex w-[132px]"
        style={{ pointerEvents: open ? "auto" : "none" }}
      >
        {showEdit ? (
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              onOpenChange(null);
              onEdit?.();
            }}
            className="flex w-1/2 items-center justify-center gap-1 bg-[var(--amber)] text-xs font-semibold text-[var(--ink-1)]"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            {editLabel}
          </button>
        ) : null}
        {showDelete ? (
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              onOpenChange(null);
              onDelete?.();
            }}
            className="flex w-1/2 items-center justify-center gap-1 bg-[var(--ink-danger)] text-xs font-semibold text-[var(--bg-paper)]"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {deleteLabel}
          </button>
        ) : null}
      </div>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        style={{
          transform: `translate3d(${translateX}px, 0, 0)`,
          transition: drag === null ? "transform 160ms ease-out" : "none",
          touchAction: "pan-y",
        }}
        className="relative bg-[var(--bg-card)]"
      >
        {children}
      </div>

      <button
        type="button"
        aria-label={open ? "Hide row actions" : "Show row actions"}
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange(open ? null : id);
        }}
        className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-card)]/70 text-[var(--ink-3)] backdrop-blur transition-opacity hover:text-[var(--ink-1)]"
        style={{ opacity: open ? 0 : 1, pointerEvents: open ? "none" : "auto" }}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {open ? (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={close}
          className="absolute inset-y-0 left-0 right-[132px] z-0 cursor-default"
        />
      ) : null}
    </div>
  );
}

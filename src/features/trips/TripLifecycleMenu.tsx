import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MoreHorizontal } from "lucide-react";

import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { tripcastApi, type TripCard, type TripLifecycle } from "../../convex/tripcastApi";
import { useTripMutation } from "../../convex/useTrip";
import { useTripContext } from "../../providers/TripContextProvider";
import { DeleteTripDialog } from "./DeleteTripDialog";
import { EditTripSheet } from "./EditTripSheet";
import { LIFECYCLE_LABELS } from "./TripListRow";
import { tripErrorInfo } from "./tripSwitchState";

type LifecycleAction = "start" | "complete" | "reopen" | "archive" | "restore";
type MenuAction = LifecycleAction | "edit" | "delete";

type MenuItem = { action: MenuAction; label: string; disabledHint?: string };

/** The menu items a card offers (spec 06-ux-trips.md item 6). */
export function menuItemsFor(card: TripCard): MenuItem[] {
  const items: MenuItem[] = [];
  const archive: MenuItem = card.isCurrent
    ? { action: "archive", label: "Archive", disabledHint: "Switch Followers first" }
    : { action: "archive", label: "Archive" };
  switch (card.lifecycle) {
    case "planned":
      items.push({ action: "start", label: "Start trip" }, archive);
      break;
    case "in_progress":
      items.push({ action: "complete", label: "Complete trip" });
      break;
    case "completed":
      items.push({ action: "reopen", label: "Reopen" }, archive);
      break;
    case "archived":
      items.push({ action: "restore", label: "Restore" });
      break;
  }
  items.push({ action: "edit", label: "Edit" }, { action: "delete", label: "Delete" });
  return items;
}

export type TripLifecycleMenuProps = {
  card: TripCard;
  /** The catalog holds no other trip (the pane knows; the server refuses regardless). */
  onlyTrip?: boolean;
  /** Shows a short message (the pane's notice). */
  notify?: (message: string) => void;
  /** Closes the trip pane (before handing over to the End Trip sheet). */
  closePane?: () => void;
  /** Opens the app's End Trip sheet for the shared current trip. */
  onRequestEndCurrentTrip?: () => void;
};

/**
 * The ⋯ menu of one card: Start, Complete, Reopen, Archive, Restore, Edit and Delete, each only where its
 * lifecycle allows, each confirmed with the trip named. Every call carries THIS card's `tripId`, never the viewed
 * trip's. The shared current trip is completed through `onRequestEndCurrentTrip` and cannot be archived.
 */
export function TripLifecycleMenu({
  card,
  onlyTrip = false,
  notify,
  closePane,
  onRequestEndCurrentTrip,
}: TripLifecycleMenuProps) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<MenuAction | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const items = menuItemsFor(card);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]:not(:disabled)")?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeMenu();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const enabled = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]:not(:disabled)"));
    const index = enabled.findIndex((el) => el === document.activeElement);
    if (index === -1 || enabled.length === 0) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    enabled[(index + step + enabled.length) % enabled.length]?.focus();
  };

  const choose = (next: MenuAction) => {
    setOpen(false);
    if (next === "complete" && card.isCurrent) {
      if (onRequestEndCurrentTrip) {
        closePane?.();
        onRequestEndCurrentTrip();
      } else {
        notify?.("End this trip from Options");
        triggerRef.current?.focus();
      }
      return;
    }
    setAction(next);
  };

  const closeAction = () => {
    setAction(null);
    // The menu item that opened a dialog is gone: hand focus back to the ⋯ control.
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };

  return (
    <div className="relative shrink-0 pr-1">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Actions for ${card.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-2)] hover:bg-[var(--meter-track)]"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${card.title}`}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-20 mt-1 grid min-w-40 gap-0.5 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-1 shadow-xl"
        >
          {items.map((item) => (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              disabled={item.disabledHint !== undefined}
              onClick={() => choose(item.action)}
              className="grid rounded-lg px-3 py-1.5 text-left text-sm text-[var(--ink-1)] hover:bg-[var(--meter-track)] disabled:opacity-60"
            >
              <span>{item.label}</span>
              {item.disabledHint ? <span className="text-xs text-[var(--ink-3)]">{item.disabledHint}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {action === "edit" ? <EditTripSheet card={card} onClose={closeAction} returnFocusRef={triggerRef} /> : null}
      {action === "delete" ? (
        <DeleteTripDialog card={card} onlyTrip={onlyTrip} onClose={closeAction} returnFocusRef={triggerRef} />
      ) : null}
      {action && action !== "edit" && action !== "delete" ? (
        <LifecycleConfirm card={card} action={action} notify={notify} onClose={closeAction} />
      ) : null}
    </div>
  );
}

type LifecycleConfirmProps = {
  card: TripCard;
  action: LifecycleAction;
  notify?: (message: string) => void;
  onClose: () => void;
};

/** Confirmation naming the trip, then ONE call carrying the card's own `tripId`. */
function LifecycleConfirm({ card, action, notify, onClose }: LifecycleConfirmProps) {
  const { token } = useTripContext();
  const setLifecycle = useTripMutation(tripcastApi.trips.setLifecycle);
  const endTrip = useTripMutation(tripcastApi.endTrip.travelerEndTrip);
  const reopenTrip = useTripMutation(tripcastApi.endTrip.travelerReopenTrip);
  const name = card.title;
  // The generated type requires a target. Without `archivedFrom` send "completed": the server's own default for
  // Restore (lifecyclePatch), so the server's choice is what happens.
  const restoreTo: TripLifecycle = card.archivedFrom ?? "completed";

  const copy: Record<LifecycleAction, { title: string; description: string; confirm: string }> = {
    start: { title: `Start ${name}?`, description: `${name} will be marked in progress.`, confirm: "Start trip" },
    complete: {
      title: `Complete ${name}?`,
      description: `${name} will be marked completed. You can reopen it later.`,
      confirm: "Complete trip",
    },
    reopen: { title: `Reopen ${name}?`, description: `${name} will be marked in progress again.`, confirm: "Reopen" },
    archive: {
      title: `Archive ${name}?`,
      description: `${name} moves out of your active trips. You can restore it later.`,
      confirm: "Archive",
    },
    restore: {
      title: `Restore ${name}?`,
      description: card.archivedFrom
        ? `${name} goes back to ${LIFECYCLE_LABELS[card.archivedFrom].toLowerCase()}.`
        : `${name} goes back to where it was before it was archived.`,
      confirm: "Restore",
    },
  };

  const run = async () => {
    const tripId = card.tripId;
    try {
      if (action === "start") await setLifecycle({ token, tripId, lifecycle: "in_progress" });
      else if (action === "archive") await setLifecycle({ token, tripId, lifecycle: "archived" });
      else if (action === "restore") await setLifecycle({ token, tripId, lifecycle: restoreTo });
      else if (action === "complete") await endTrip({ token, tripId });
      else await reopenTrip({ token, tripId });
    } catch (error) {
      notify?.(tripErrorInfo(error, `Could not update ${name}. Try again.`).message);
    }
  };

  return (
    <ConfirmModal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={copy[action].title}
      description={copy[action].description}
      confirmLabel={copy[action].confirm}
      onConfirm={() => void run()}
    />
  );
}

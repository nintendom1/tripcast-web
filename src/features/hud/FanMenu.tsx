import * as React from "react";
import { useEffect } from "react";
import { MapPin, Sparkles, Trophy, Vote as VoteIcon, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { TERMS } from "../../copy/terminology";

export type FanAction = "checkin" | "activity" | "transaction" | "mission" | "vote";

export interface FanMenuProps {
  open: boolean;
  onClose: () => void;
  onPick: (action: FanAction) => void;
  items?: FanAction[];
  className?: string;
}

const ITEM_CONFIG: Record<FanAction, { label: string; icon: React.ReactNode; color: string }> = {
  checkin: {
    label: `${TERMS.checkIn} / ${TERMS.story}`,
    icon: <MapPin className="h-4 w-4" aria-hidden="true" />,
    color: "var(--flag)",
  },
  activity: {
    label: "Set Activity",
    icon: <Sparkles className="h-4 w-4" aria-hidden="true" />,
    color: "var(--amber)",
  },
  transaction: {
    label: "Add Spending",
    icon: <Wallet className="h-4 w-4" aria-hidden="true" />,
    color: "var(--green)",
  },
  mission: {
    label: `Create ${TERMS.mission}`,
    icon: <Trophy className="h-4 w-4" aria-hidden="true" />,
    color: "var(--plum)",
  },
  vote: {
    label: `Create ${TERMS.routeVote}`,
    icon: <VoteIcon className="h-4 w-4" aria-hidden="true" />,
    color: "var(--teal)",
  },
};

const DEFAULT_TRAVELER_ITEMS: FanAction[] = [
  "checkin",
  "activity",
  "transaction",
  "mission",
  "vote",
];

/**
 * FanMenu — quick-action stack above the Dock's center "+" for Traveler.
 *
 * Opens as a vertical column anchored to the FAB; backdrop dismisses without
 * triggering a pick. Support Crew skip the fan entirely and route "+" straight
 * to "Propose Mission" — they should not see this component.
 */
export function FanMenu({
  open,
  onClose,
  onPick,
  items = DEFAULT_TRAVELER_ITEMS,
  className,
}: FanMenuProps) {
  const log = useDebugLogger("FanMenu", "src/features/hud/FanMenu.tsx");

  useEffect(() => {
    if (open) log.logInteraction("menu:open");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Close quick actions"
        onClick={onClose}
        className="fixed inset-0 z-[19] cursor-default bg-black/20"
      />
      <div
        role="menu"
        aria-label="Quick actions"
        className={cn(
          "pointer-events-auto absolute bottom-[calc(var(--dock-h,76px)+24px)] left-1/2 z-[20] flex -translate-x-1/2 flex-col gap-2",
          className,
        )}
      >
        {items.map((id) => {
          const cfg = ITEM_CONFIG[id];
          return (
            <button
              key={id}
              type="button"
              role="menuitem"
              onClick={() => { log.logInteraction("action:select", { action: id, label: cfg.label }); onPick(id); }}
              className="flex items-center gap-2 rounded-full bg-[var(--bg-card)] py-2 pl-2 pr-4 text-sm font-semibold text-[var(--ink-1)] shadow-[var(--shadow-card)] transition-transform active:scale-[0.98]"
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-white"
                style={{ background: cfg.color }}
                aria-hidden="true"
              >
                {cfg.icon}
              </span>
              {cfg.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

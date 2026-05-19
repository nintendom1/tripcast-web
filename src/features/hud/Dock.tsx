import * as React from "react";
import { Clock, Plus, Trophy, Vote as VoteIcon, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebugLogger } from "../../debug/useDebugLogger";

export type DockTab = "history" | "challenges" | "votes" | "funds";

export interface DockBadges {
  history?: number;
  challenges?: number;
  votes?: number;
  votesPulsing?: boolean;
}

export interface DockProps {
  active: DockTab | null;
  onSelect: (tab: DockTab) => void;
  onAdd: () => void;
  fanOpen?: boolean;
  showAdd?: boolean;
  showFunds?: boolean;
  addLabel?: string;
  badges?: DockBadges;
  className?: string;
}

/**
 * Bottom Dock replaces the legacy bottom-left + bottom-right FAB clusters with
 * a single nav strip: Story · Missions · [+] · Votes · Funds.
 *
 * The center FAB is the entry point for adding (Traveler) or proposing (Support
 * Crew) — its behavior is owned by the parent. Pulsing vote badge signals an
 * active vote that the crew has not yet seen.
 */
export function Dock({
  active,
  onSelect,
  onAdd,
  fanOpen = false,
  showAdd = true,
  showFunds = true,
  addLabel = "Add",
  badges = {},
  className,
}: DockProps) {
  const log = useDebugLogger("Dock", "src/features/hud/Dock.tsx");

  function handleSelect(tab: DockTab) {
    log.logInteraction("tab:select", { tab, previously: active });
    onSelect(tab);
  }

  return (
    <nav
      aria-label="Map sections"
      className={cn(
        "pointer-events-auto flex items-center justify-between gap-1 rounded-full bg-[var(--bg-card)] px-2 py-1.5 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <DockButton
        active={active === "history"}
        label="Story"
        icon={<Clock className="h-5 w-5" aria-hidden="true" />}
        badge={badges.history}
        onClick={() => handleSelect("history")}
      />
      <DockButton
        active={active === "challenges"}
        label="Missions"
        icon={<Trophy className="h-5 w-5" aria-hidden="true" />}
        badge={badges.challenges}
        onClick={() => handleSelect("challenges")}
      />

      {showAdd ? (
        <button
          type="button"
          onClick={onAdd}
          aria-label={fanOpen ? "Close actions" : addLabel}
          aria-expanded={fanOpen}
          className={cn(
            "relative -my-3 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-[var(--shadow-fab)] transition-transform",
            fanOpen ? "rotate-45" : "rotate-0",
          )}
          style={{ background: "var(--flag)" }}
        >
          <Plus className="h-6 w-6" strokeWidth={2.6} aria-hidden="true" />
        </button>
      ) : (
        <span className="w-12" aria-hidden="true" />
      )}

      <DockButton
        active={active === "votes"}
        label="Votes"
        icon={<VoteIcon className="h-5 w-5" aria-hidden="true" />}
        badge={badges.votes}
        badgePulsing={badges.votesPulsing}
        onClick={() => handleSelect("votes")}
      />

      {showFunds ? (
        <DockButton
          active={active === "funds"}
          label="Funds"
          icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
          onClick={() => handleSelect("funds")}
        />
      ) : null}
    </nav>
  );
}

interface DockButtonProps {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  badgePulsing?: boolean;
  onClick: () => void;
}

function DockButton({ active, label, icon, badge, badgePulsing, onClick }: DockButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        "relative flex h-11 min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-full px-2 text-[10px] font-semibold transition-colors",
        active
          ? "bg-[var(--ink-1)] text-[var(--ink-on-dark)]"
          : "text-[var(--ink-2)] hover:bg-[var(--meter-track)]",
      )}
    >
      {icon}
      <span className="font-[var(--font-mono)] uppercase tracking-[0.08em]">{label}</span>
      {badge && badge > 0 ? (
        <span
          className={cn(
            "absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-[var(--font-mono)] text-[9px] font-bold text-white",
            badgePulsing ? "animate-pulse" : "",
          )}
          style={{ background: "var(--flag)" }}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </button>
  );
}

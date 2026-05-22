import * as React from "react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { Dock, type DockBadges, type DockTab } from "../hud/Dock";
import { TERMS } from "../../copy/terminology";

export interface DesktopMapFrameProps {
  children: React.ReactNode;
  isDesktop: boolean;
  /** Dock state passed through to the left-rail Dock on desktop. */
  activeDockTab: DockTab | null;
  onDockSelect: (tab: DockTab) => void;
  onAdd: () => void;
  fanOpen: boolean;
  role: "traveler" | "follower";
  badges: DockBadges;
  addLabel?: string;
  showAdd?: boolean;
  showAchievements?: boolean;
}

/**
 * Desktop showcase-rail wrapper.
 *
 * Mobile (< 960px): transparent — renders children unchanged.
 * Desktop (≥ 960px): 3-column grid:
 *   - Left rail  (88px): vertical Dock navigation
 *   - Center     (1fr): map content (children)
 *   - Right rail (380px): active-sheet frame placeholder (sheets migrate here in PR 4+)
 *
 * The Dock that lives in the center column on mobile is expected to be hidden
 * by the caller when isDesktop=true; the left rail Dock is the sole nav target.
 */
export function DesktopMapFrame({
  children,
  isDesktop,
  activeDockTab,
  onDockSelect,
  onAdd,
  fanOpen,
  role,
  badges,
  addLabel = "Add",
  showAdd = true,
  showAchievements = false,
}: DesktopMapFrameProps) {
  const log = useDebugLogger("DesktopMapFrame", "src/features/layout/DesktopMapFrame.tsx");

  useEffect(() => {
    log.logUi("layout:mode", { mode: isDesktop ? "desktop" : "mobile", viewportW: window.innerWidth });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop]);

  if (!isDesktop) {
    return <>{children}</>;
  }

  return (
    <div className="grid h-full w-full overflow-hidden" style={{ gridTemplateColumns: "88px 1fr 380px" }}>
      {/* ── Left rail ── */}
      <aside
        aria-label="Navigation rail"
        className="flex flex-col items-center gap-4 border-r border-[var(--line-soft)] bg-[var(--bg-paper)] pt-5 pb-6"
      >
        {/* Trip crest */}
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl font-black text-white shadow"
          style={{ background: "var(--flag)" }}
          aria-hidden="true"
        >
          ✿
        </div>
        <div className="h-px w-8 shrink-0 bg-[var(--line-soft)]" aria-hidden="true" />

        {/* Vertical Dock */}
        <Dock
          variant="rail"
          active={activeDockTab}
          onSelect={onDockSelect}
          onAdd={onAdd}
          fanOpen={fanOpen}
          addLabel={addLabel}
          showAdd={showAdd}
          showFunds={false}
          showAchievements={showAchievements}
          badges={badges}
          className="w-full flex-1"
        />
      </aside>

      {/* ── Center — map content ── */}
      <div className="relative min-h-0 overflow-hidden">
        {children}
      </div>

      {/* ── Right rail — active-sheet frame (PR 2 foundation placeholder) ── */}
      <aside
        aria-label="Panel frame"
        className="flex flex-col items-center justify-center gap-3 border-l border-[var(--line-soft)] bg-[var(--bg-paper)] px-6 text-center"
      >
        <div
          className={cn(
            "grid h-20 w-20 place-items-center rounded-full text-3xl",
            "bg-[var(--meter-track)]",
          )}
          aria-hidden="true"
        >
          🗺
        </div>
        <p
          className="text-sm font-bold text-[var(--ink-2)]"
          style={{ fontFamily: "var(--meadow-font-display)" }}
        >
          Pick from the rail
        </p>
        <p className="text-xs text-[var(--ink-3)]">
          {TERMS.journal}, {TERMS.missions}, Votes, {TERMS.awards}, or State.
        </p>
      </aside>
    </div>
  );
}

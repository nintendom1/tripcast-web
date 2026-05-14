import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

import type { HistoryEvent } from "../../convex/tripcastApi";
import HistoryEventCard from "./HistoryEventCard";

const PANEL_MOTION = {
  initial: { y: "100%" },
  animate: { y: 0 },
  exit: { y: "100%" },
  transition: { duration: 0.22, ease: "easeOut" as const },
};

type FilterTab = "story" | "all" | "checkins" | "challenges" | "votes";

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "story", label: "Story" },
  { id: "all", label: "All" },
  { id: "checkins", label: "Check-ins" },
  { id: "challenges", label: "Challenges" },
  { id: "votes", label: "Votes" },
];

function filterEvents(events: HistoryEvent[], tab: FilterTab): HistoryEvent[] {
  switch (tab) {
    case "story":
      return events.filter((e) => e.storyLevel === "story");
    case "all":
      return events;
    case "checkins":
      return events.filter((e) => e.type === "check_in");
    case "challenges":
      return events.filter((e) => e.type.startsWith("challenge_"));
    case "votes":
      return events.filter((e) => e.type.startsWith("route_vote_"));
  }
}

type HistoryPanelProps = {
  events: HistoryEvent[];
  onClose: () => void;
  onCheckInSelect: (event: HistoryEvent) => void;
  onLocationFocus: (coord: { lat: number; lon: number }) => void;
  onMarkAllRead: () => void;
};

export default function HistoryPanel({
  events,
  onClose,
  onCheckInSelect,
  onLocationFocus,
  onMarkAllRead,
}: HistoryPanelProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("story");

  useEffect(() => {
    onMarkAllRead();
  // onMarkAllRead is stable; calling on mount is intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = filterEvents(events, activeTab);

  return (
    <motion.div
      {...PANEL_MOTION}
      className="absolute inset-x-0 bottom-0 z-[10] flex flex-col bg-background rounded-t-xl shadow-2xl"
      style={{ maxHeight: "85dvh" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <h2 className="text-base font-bold text-navy">Journey History</h2>
        <button
          type="button"
          aria-label="Close history"
          className="rounded-md p-1.5 hover:bg-muted transition-colors"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Filter tabs */}
      <div
        className="flex gap-1.5 overflow-x-auto px-4 pb-2 shrink-0 scrollbar-none"
        role="tablist"
        aria-label="History filters"
      >
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-navy text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {activeTab === "story" ? "No story entries yet." : "No entries."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((event) => (
              <HistoryEventCard
                key={event._id}
                event={event}
                onCheckInSelect={onCheckInSelect}
                onLocationFocus={onLocationFocus}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

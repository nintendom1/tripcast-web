import { useEffect, useState } from "react";
import { X } from "lucide-react";

import type { HistoryEvent } from "../../convex/tripcastApi";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import HistoryEventCard from "./HistoryEventCard";

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
    return () => { onMarkAllRead(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = filterEvents(events, activeTab);

  return (
    <Sheet
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showBackdrop={false}
        className="z-[10] shadow-2xl"
      >
        <SheetHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <SheetTitle className="text-base font-bold text-navy">
            Journey History
          </SheetTitle>
          <button
            type="button"
            aria-label="Close history"
            className="rounded-md p-1.5 hover:bg-muted transition-colors"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </SheetHeader>

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
              id={`history-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls="history-tabpanel"
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

        <div
          id="history-tabpanel"
          role="tabpanel"
          aria-labelledby={`history-tab-${activeTab}`}
          className="flex-1 overflow-y-auto px-4 pb-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
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
      </SheetContent>
    </Sheet>
  );
}

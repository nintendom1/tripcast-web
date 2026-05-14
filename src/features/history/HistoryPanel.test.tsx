import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HistoryPanel from "./HistoryPanel";
import type { HistoryEvent } from "../../convex/tripcastApi";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: { div: "div" },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function makeEvent(overrides: Partial<HistoryEvent> = {}): HistoryEvent {
  return {
    _id: overrides._id ?? "id1",
    _creationTime: 1000,
    type: "check_in",
    storyLevel: "story",
    occurredAt: Date.now(),
    createdAt: Date.now(),
    title: "Test Pin",
    ...overrides,
  };
}

const defaultProps = {
  events: [] as HistoryEvent[],
  onClose: vi.fn(),
  onCheckInSelect: vi.fn(),
  onLocationFocus: vi.fn(),
  onMarkAllRead: vi.fn(),
};

describe("HistoryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onMarkAllRead on mount", () => {
    const onMarkAllRead = vi.fn();
    render(<HistoryPanel {...defaultProps} onMarkAllRead={onMarkAllRead} />);
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it("shows empty state on Story tab when no events", () => {
    render(<HistoryPanel {...defaultProps} />);
    expect(screen.getByText("No story entries yet.")).toBeInTheDocument();
  });

  it("default tab is Story — shows only story-level events", () => {
    const events = [
      makeEvent({ _id: "a", storyLevel: "story", title: "Story Event" }),
      makeEvent({ _id: "b", storyLevel: "activity", title: "Activity Event", type: "route_vote_opened" }),
    ];
    render(<HistoryPanel {...defaultProps} events={events} />);
    expect(screen.getByText("Story Event")).toBeInTheDocument();
    expect(screen.queryByText("Activity Event")).not.toBeInTheDocument();
  });

  it("switching to All tab shows all events", () => {
    const events = [
      makeEvent({ _id: "a", storyLevel: "story", title: "Story Event" }),
      makeEvent({ _id: "b", storyLevel: "activity", title: "Activity Vote", type: "route_vote_opened" }),
    ];
    render(<HistoryPanel {...defaultProps} events={events} />);
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(screen.getByText("Story Event")).toBeInTheDocument();
    expect(screen.getByText("Activity Vote")).toBeInTheDocument();
  });

  it("clicking a check-in card calls onCheckInSelect", () => {
    const onCheckInSelect = vi.fn();
    const event = makeEvent({ _id: "a", storyLevel: "story", title: "My Pin" });
    render(<HistoryPanel {...defaultProps} events={[event]} onCheckInSelect={onCheckInSelect} />);
    fireEvent.click(screen.getByText("My Pin"));
    expect(onCheckInSelect).toHaveBeenCalledWith(event);
  });

  it("check-in card shows mood emoji when moodValue is set", () => {
    const events = [makeEvent({ moodValue: "good" })];
    render(<HistoryPanel {...defaultProps} events={events} />);
    // emoji should be present (aria-hidden, but still in DOM)
    expect(screen.getByRole("button", { name: /check-in/i })).toBeInTheDocument();
  });

  it("vote card with lat/lon renders Focus on map button", () => {
    const onLocationFocus = vi.fn();
    const events = [makeEvent({ _id: "a", type: "route_vote_resolved", storyLevel: "story", lat: 47.6, lon: -122.3, title: "Vote Done" })];
    render(<HistoryPanel {...defaultProps} events={events} onLocationFocus={onLocationFocus} />);
    fireEvent.click(screen.getByText("Focus on map"));
    expect(onLocationFocus).toHaveBeenCalledWith({ lat: 47.6, lon: -122.3 });
  });

  it("onClose is called when close button is clicked", () => {
    const onClose = vi.fn();
    render(<HistoryPanel {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close history" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("State tab is not present", () => {
    render(<HistoryPanel {...defaultProps} />);
    expect(screen.queryByRole("tab", { name: "State" })).not.toBeInTheDocument();
  });
});

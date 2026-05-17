import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HistorySheet from "./HistorySheet";
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
  token: "test-token",
  onClose: vi.fn(),
  onCheckInSelect: vi.fn(),
  onStorySelect: vi.fn(),
  onLocationFocus: vi.fn(),
  onMarkAllRead: vi.fn(),
};

describe("HistorySheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onMarkAllRead on unmount, not on mount", () => {
    const onMarkAllRead = vi.fn();
    const { unmount } = render(<HistorySheet {...defaultProps} onMarkAllRead={onMarkAllRead} />);
    expect(onMarkAllRead).not.toHaveBeenCalled();
    unmount();
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it("shows empty state on Story tab when no events", () => {
    render(<HistorySheet {...defaultProps} />);
    expect(screen.getByText("No story entries yet.")).toBeInTheDocument();
  });

  it("default tab is Story — shows only story-level events", () => {
    const events = [
      makeEvent({ _id: "a", storyLevel: "story", title: "Story Event" }),
      makeEvent({ _id: "b", storyLevel: "activity", title: "Activity Event", type: "route_vote_opened" }),
    ];
    render(<HistorySheet {...defaultProps} events={events} />);
    expect(screen.getByText("Story Event")).toBeInTheDocument();
    expect(screen.queryByText("Activity Event")).not.toBeInTheDocument();
  });

  it("switching to All tab shows all events", () => {
    const events = [
      makeEvent({ _id: "a", storyLevel: "story", title: "Story Event" }),
      makeEvent({ _id: "b", storyLevel: "activity", title: "Activity Vote", type: "route_vote_opened" }),
    ];
    render(<HistorySheet {...defaultProps} events={events} />);
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(screen.getByText("Story Event")).toBeInTheDocument();
    expect(screen.getByText("Activity Vote")).toBeInTheDocument();
  });

  it("clicking a story-level check-in routes to onStorySelect, not onCheckInSelect", () => {
    const onStorySelect = vi.fn();
    const onCheckInSelect = vi.fn();
    const event = makeEvent({ _id: "a", storyLevel: "story", title: "My Story Pin" });
    render(
      <HistorySheet
        {...defaultProps}
        events={[event]}
        onCheckInSelect={onCheckInSelect}
        onStorySelect={onStorySelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /check-in: my story pin/i }));
    expect(onStorySelect).toHaveBeenCalledWith(event);
    expect(onCheckInSelect).not.toHaveBeenCalled();
  });

  it("clicking an activity-level check-in routes to onCheckInSelect", () => {
    const onStorySelect = vi.fn();
    const onCheckInSelect = vi.fn();
    const event = makeEvent({ _id: "a", storyLevel: "activity", title: "Quick Stop" });
    // Activity-level check-ins live on the All tab, not Story
    render(
      <HistorySheet
        {...defaultProps}
        events={[event]}
        onCheckInSelect={onCheckInSelect}
        onStorySelect={onStorySelect}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    fireEvent.click(screen.getByRole("button", { name: /check-in: quick stop/i }));
    expect(onCheckInSelect).toHaveBeenCalledWith(event);
    expect(onStorySelect).not.toHaveBeenCalled();
  });

  it("check-in row renders with check-in aria-label", () => {
    const events = [makeEvent({ moodValue: "good" })];
    render(<HistorySheet {...defaultProps} events={events} />);
    expect(screen.getByRole("button", { name: /check-in:/i })).toBeInTheDocument();
  });

  it("clicking a non-checkin row with lat/lon calls onLocationFocus", () => {
    const onLocationFocus = vi.fn();
    const events = [
      makeEvent({
        _id: "a",
        type: "route_vote_resolved",
        storyLevel: "story",
        lat: 47.6,
        lon: -122.3,
        title: "Vote Done",
      }),
    ];
    render(<HistorySheet {...defaultProps} events={events} onLocationFocus={onLocationFocus} />);
    fireEvent.click(screen.getByRole("button", { name: /vote resolved/i }));
    expect(onLocationFocus).toHaveBeenCalledWith({ lat: 47.6, lon: -122.3 });
  });

  it("onClose is called when close button is clicked", () => {
    const onClose = vi.fn();
    render(<HistorySheet {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close history" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("State tab is not present", () => {
    render(<HistorySheet {...defaultProps} />);
    expect(screen.queryByRole("tab", { name: "State" })).not.toBeInTheDocument();
  });
});

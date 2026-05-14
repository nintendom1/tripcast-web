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
      makeEvent({ _id: "b", storyLevel: "activity", title: "Activity Event", type: "traveler_state_updated" }),
    ];
    render(<HistoryPanel {...defaultProps} events={events} />);
    expect(screen.getByText("Story Event")).toBeInTheDocument();
    expect(screen.queryByText("Activity Event")).not.toBeInTheDocument();
  });

  it("switching to All tab shows all events", () => {
    const events = [
      makeEvent({ _id: "a", storyLevel: "story", title: "Story Event" }),
      makeEvent({ _id: "b", storyLevel: "activity", type: "traveler_state_updated", title: undefined, body: "Activity note" }),
    ];
    render(<HistoryPanel {...defaultProps} events={events} />);
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(screen.getByText("Story Event")).toBeInTheDocument();
    expect(screen.getByText("Activity note")).toBeInTheDocument();
  });

  it("check-in card with long body shows truncated text and Read more button", () => {
    const longBody = "x".repeat(200);
    const events = [makeEvent({ body: longBody })];
    render(<HistoryPanel {...defaultProps} events={events} />);
    expect(screen.getByText("Read more")).toBeInTheDocument();
  });

  it("clicking Read more expands full body", () => {
    const longBody = "A".repeat(200);
    const events = [makeEvent({ body: longBody })];
    render(<HistoryPanel {...defaultProps} events={events} />);
    fireEvent.click(screen.getByText("Read more"));
    expect(screen.getByText(longBody)).toBeInTheDocument();
    expect(screen.getByText("Collapse")).toBeInTheDocument();
  });

  it("card with lat/lon renders Focus on map button that calls onLocationFocus", () => {
    const onLocationFocus = vi.fn();
    const events = [makeEvent({ lat: 47.6, lon: -122.3 })];
    render(<HistoryPanel {...defaultProps} events={events} onLocationFocus={onLocationFocus} />);
    fireEvent.click(screen.getByText("Focus on map"));
    expect(onLocationFocus).toHaveBeenCalledWith({ lat: 47.6, lon: -122.3 });
  });

  it("card without coordinates has no Focus on map button", () => {
    const events = [makeEvent({ lat: undefined, lon: undefined })];
    render(<HistoryPanel {...defaultProps} events={events} />);
    expect(screen.queryByText("Focus on map")).not.toBeInTheDocument();
  });

  it("switching to Check-ins tab shows only check_in events", () => {
    const events = [
      makeEvent({ _id: "a", type: "check_in", title: "Checkin" }),
      makeEvent({ _id: "b", type: "traveler_state_updated", storyLevel: "activity", title: undefined }),
    ];
    render(<HistoryPanel {...defaultProps} events={events} />);
    fireEvent.click(screen.getByRole("tab", { name: "Check-ins" }));
    expect(screen.getByText("Checkin")).toBeInTheDocument();
  });

  it("onClose is called when close button is clicked", () => {
    const onClose = vi.fn();
    render(<HistoryPanel {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close history" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

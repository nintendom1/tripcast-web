import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as convexReact from "convex/react";
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
    fireEvent.click(screen.getByRole("button", { name: /check in: my story pin/i }));
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
    fireEvent.click(screen.getByRole("button", { name: /check in: quick stop/i }));
    expect(onCheckInSelect).toHaveBeenCalledWith(event);
    expect(onStorySelect).not.toHaveBeenCalled();
  });

  it("Story row renders with Check In aria-label", () => {
    const events = [makeEvent({ moodValue: "good" })];
    render(<HistorySheet {...defaultProps} events={events} />);
    expect(screen.getByRole("button", { name: /check in:/i })).toBeInTheDocument();
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
    // route_vote_resolved is no longer a Story-tab row (vote outcomes are
    // status announcements, not narratives) — switch to the Votes tab.
    fireEvent.click(screen.getByRole("tab", { name: "Votes" }));
    fireEvent.click(screen.getByRole("button", { name: /vote resolved/i }));
    expect(onLocationFocus).toHaveBeenCalledWith({ lat: 47.6, lon: -122.3 });
  });

  it("Story tab excludes route_vote_resolved and mission_planned auto-events", () => {
    const events = [
      makeEvent({ _id: "a", storyLevel: "story", title: "Real Story Pin" }),
      makeEvent({
        _id: "b",
        type: "route_vote_resolved",
        storyLevel: "story",
        title: "Resolved Vote",
      }),
      makeEvent({
        _id: "c",
        type: "mission_planned",
        storyLevel: "story",
        title: "Planned Mission",
      }),
    ];
    render(<HistorySheet {...defaultProps} events={events} />);
    expect(screen.getByText("Real Story Pin")).toBeInTheDocument();
    expect(screen.queryByText("Resolved Vote")).not.toBeInTheDocument();
    expect(screen.queryByText("Planned Mission")).not.toBeInTheDocument();
  });

  it("Story tab includes mission_completed entries", () => {
    const events = [
      makeEvent({
        _id: "c",
        type: "mission_completed",
        storyLevel: "story",
        title: "Mission Wrapped",
      }),
    ];
    render(<HistorySheet {...defaultProps} events={events} />);
    expect(screen.getByText("Mission Wrapped")).toBeInTheDocument();
  });

  it("onClose is called when close button is clicked", () => {
    const onClose = vi.fn();
    render(<HistorySheet {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close journal" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("State tab is not present", () => {
    render(<HistorySheet {...defaultProps} />);
    expect(screen.queryByRole("tab", { name: "State" })).not.toBeInTheDocument();
  });

  describe("inline story creation", () => {
    let mutationFn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mutationFn = vi.fn().mockResolvedValue("new-cp-id");
      vi.mocked(convexReact.useMutation).mockReturnValue(mutationFn as any);
      vi.mocked(convexReact.useQuery).mockReturnValue(undefined as any);
    });

    it('shows "+ New" button for traveler role', () => {
      render(<HistorySheet {...defaultProps} role="traveler" />);
      expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    });

    it('does not show "+ New" button for support_crew', () => {
      render(<HistorySheet {...defaultProps} role="support_crew" />);
      expect(screen.queryByRole("button", { name: "New" })).not.toBeInTheDocument();
    });

    it("clicking New shows the inline create form", async () => {
      const user = userEvent.setup();
      render(<HistorySheet {...defaultProps} role="traveler" />);
      await user.click(screen.getByRole("button", { name: "New" }));
      expect(screen.getByPlaceholderText("Story title (optional)")).toBeInTheDocument();
    });

    it("Cancel in create form returns to the list view", async () => {
      const user = userEvent.setup();
      render(<HistorySheet {...defaultProps} role="traveler" />);
      await user.click(screen.getByRole("button", { name: "New" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByPlaceholderText("Story title (optional)")).not.toBeInTheDocument();
    });

    it("submitting the form calls addCheckpoint with showInStory=true and source=inline_form", async () => {
      const user = userEvent.setup();
      render(<HistorySheet {...defaultProps} role="traveler" />);
      await user.click(screen.getByRole("button", { name: "New" }));
      await user.type(screen.getByPlaceholderText("Story title (optional)"), "My Story");
      await user.type(screen.getByPlaceholderText("What happened?"), "It was great");
      await user.click(screen.getByRole("button", { name: "Add to Journal" }));
      expect(mutationFn).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "test-token",
          title: "My Story",
          note: "It was great",
          showInStory: true,
          source: "inline_form",
        }),
      );
    });
  });

  describe("Traveler role — swipe row actions", () => {
    const travelerEvent = makeEvent({ _id: "evt1", checkpointId: "cp1", title: "Trail stop" });
    const travelerProps = { ...defaultProps, role: "traveler" as const, events: [travelerEvent] };

    it("shows the More button on check-in rows that have a checkpointId", () => {
      render(<HistorySheet {...travelerProps} />);
      expect(screen.getByRole("button", { name: "Show row actions" })).toBeInTheDocument();
    });

    it("clicking ... then Edit opens the edit sheet", () => {
      render(<HistorySheet {...travelerProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Show row actions" }));
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      expect(screen.getByText("Edit check-in")).toBeInTheDocument();
    });

    it("clicking ... then Delete opens the confirm dialog", () => {
      render(<HistorySheet {...travelerProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Show row actions" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      expect(screen.getByText("Delete this Story?")).toBeInTheDocument();
    });
  });
});

import { act, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as convexReact from "convex/react";
import JournalSheet from "./JournalSheet";
import { tripcastApi, type JournalEvent } from "../../convex/tripcastApi";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: "div",
    img: "img",
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function makeEvent(overrides: Partial<JournalEvent> = {}): JournalEvent {
  return {
    _id: overrides._id ?? "id1",
    _creationTime: 1000,
    type: "story",
    narrativeLevel: "narrative",
    occurredAt: Date.now(),
    createdAt: Date.now(),
    title: "Test Pin",
    ...overrides,
  };
}

// The filter is a dropdown (FilterButton), not a tablist: open it, then click
// the option by its label.
function selectFilter(name: string) {
  fireEvent.click(screen.getByRole("button", { name: /filter/i }));
  fireEvent.click(screen.getByRole("button", { name }));
}

const defaultProps = {
  events: [] as JournalEvent[],
  token: "test-token",
  open: true,
  onClose: vi.fn(),
  onStorySelect: vi.fn(),
  onLocationFocus: vi.fn(),
  onMarkAllRead: vi.fn(),
};

describe("JournalSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onMarkAllRead on unmount, not on mount", () => {
    const onMarkAllRead = vi.fn();
    const { unmount } = render(<JournalSheet {...defaultProps} onMarkAllRead={onMarkAllRead} />);
    expect(onMarkAllRead).not.toHaveBeenCalled();
    unmount();
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it("shows empty state on Story tab when no events", () => {
    render(<JournalSheet {...defaultProps} />);
    expect(screen.getByText("No story entries yet.")).toBeInTheDocument();
  });

  it("default tab is Story — shows only narrative-level events", () => {
    const events = [
      makeEvent({ _id: "a", narrativeLevel: "narrative", title: "Story Event" }),
      makeEvent({ _id: "b", narrativeLevel: "activity", title: "Activity Event", type: "route_vote_opened" }),
    ];
    render(<JournalSheet {...defaultProps} events={events} />);
    expect(screen.getByText("Story Event")).toBeInTheDocument();
    expect(screen.queryByText("Activity Event")).not.toBeInTheDocument();
  });

  it("switching to All tab shows all events", () => {
    const events = [
      makeEvent({ _id: "a", narrativeLevel: "narrative", title: "Story Event" }),
      makeEvent({ _id: "b", narrativeLevel: "activity", title: "Activity Mission", type: "mission_visible" }),
    ];
    render(<JournalSheet {...defaultProps} events={events} />);
    selectFilter("All");
    expect(screen.getByText("Story Event")).toBeInTheDocument();
    expect(screen.getByText("Activity Mission")).toBeInTheDocument();
  });

  it("does not show route vote events in Journal", () => {
    const events = [
      makeEvent({ _id: "a", narrativeLevel: "narrative", title: "Story Event" }),
      makeEvent({ _id: "b", narrativeLevel: "activity", title: "Activity Vote", type: "route_vote_opened" }),
    ];
    render(<JournalSheet {...defaultProps} events={events} />);
    selectFilter("All");
    expect(screen.getByText("Story Event")).toBeInTheDocument();
    expect(screen.queryByText("Activity Vote")).not.toBeInTheDocument();
  });

  it("clicking a story event calls onStorySelect", () => {
    const onStorySelect = vi.fn();
    const event = makeEvent({ _id: "a", narrativeLevel: "narrative", title: "My Story Pin" });
    render(
      <JournalSheet
        {...defaultProps}
        events={[event]}
        onStorySelect={onStorySelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /check in: my story pin/i }));
    expect(onStorySelect).toHaveBeenCalledWith(event);
  });

  it("clicking an activity-level story event also calls onStorySelect", () => {
    const onStorySelect = vi.fn();
    const event = makeEvent({ _id: "a", narrativeLevel: "activity", title: "Quick Stop" });
    render(
      <JournalSheet
        {...defaultProps}
        events={[event]}
        onStorySelect={onStorySelect}
      />,
    );
    selectFilter("All");
    fireEvent.click(screen.getByRole("button", { name: /check in: quick stop/i }));
    expect(onStorySelect).toHaveBeenCalledWith(event);
  });

  it("Story row renders with Check In aria-label", () => {
    const events = [makeEvent({ moodValue: "good" })];
    render(<JournalSheet {...defaultProps} events={events} />);
    expect(screen.getByRole("button", { name: /check in:/i })).toBeInTheDocument();
  });

  it("clicking a non-story row with lat/lon calls onLocationFocus", () => {
    const onLocationFocus = vi.fn();
    const events = [
      makeEvent({
        _id: "a",
        type: "mission_visible",
        narrativeLevel: "narrative",
        lat: 47.6,
        lon: -122.3,
        title: "Mission Visible",
      }),
    ];
    render(<JournalSheet {...defaultProps} events={events} onLocationFocus={onLocationFocus} />);
    selectFilter("All");
    fireEvent.click(screen.getByRole("button", { name: /mission accepted/i }));
    expect(onLocationFocus).toHaveBeenCalledWith({ lat: 47.6, lon: -122.3 });
  });

  it("Story tab excludes route_vote_resolved and mission_planned auto-events", () => {
    const events = [
      makeEvent({ _id: "a", narrativeLevel: "narrative", title: "Real Story Pin" }),
      makeEvent({
        _id: "b",
        type: "route_vote_resolved",
        narrativeLevel: "narrative",
        title: "Resolved Vote",
      }),
      makeEvent({
        _id: "c",
        type: "mission_planned",
        narrativeLevel: "narrative",
        title: "Planned Mission",
      }),
    ];
    render(<JournalSheet {...defaultProps} events={events} />);
    expect(screen.getByText("Real Story Pin")).toBeInTheDocument();
    expect(screen.queryByText("Resolved Vote")).not.toBeInTheDocument();
    expect(screen.queryByText("Planned Mission")).not.toBeInTheDocument();
  });

  it("Story tab includes mission_completed entries", () => {
    const events = [
      makeEvent({
        _id: "c",
        type: "mission_completed",
        narrativeLevel: "narrative",
        title: "Mission Wrapped",
      }),
    ];
    render(<JournalSheet {...defaultProps} events={events} />);
    expect(screen.getByText("Mission Wrapped")).toBeInTheDocument();
  });

  it("onClose is called when close button is clicked", () => {
    const onClose = vi.fn();
    render(<JournalSheet {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close journal" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("State tab is not present", () => {
    render(<JournalSheet {...defaultProps} />);
    expect(screen.queryByRole("tab", { name: "State" })).not.toBeInTheDocument();
  });

  it("Votes tab is not present", () => {
    render(<JournalSheet {...defaultProps} />);
    expect(screen.queryByRole("tab", { name: "Votes" })).not.toBeInTheDocument();
  });

  describe("inline story creation", () => {
    let mutationFn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mutationFn = vi.fn().mockResolvedValue("new-cp-id");
      vi.mocked(convexReact.useMutation).mockReturnValue(mutationFn as any);
      vi.mocked(convexReact.useQuery).mockReturnValue(undefined as any);
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: vi.fn(() => "blob:story-image"),
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: vi.fn(),
      });
    });

    it('shows "+ New" button for traveler role', () => {
      render(<JournalSheet {...defaultProps} role="traveler" />);
      expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    });

    it('does not show "+ New" button for follower', () => {
      render(<JournalSheet {...defaultProps} role="follower" />);
      expect(screen.queryByRole("button", { name: "New" })).not.toBeInTheDocument();
    });

    it("clicking New shows the inline create form", async () => {
      const user = userEvent.setup();
      render(<JournalSheet {...defaultProps} role="traveler" />);
      await user.click(screen.getByRole("button", { name: "New" }));
      expect(screen.getByPlaceholderText("Story title (optional)")).toBeInTheDocument();
    });

    it("Cancel in create form returns to the list view", async () => {
      const user = userEvent.setup();
      render(<JournalSheet {...defaultProps} role="traveler" />);
      await user.click(screen.getByRole("button", { name: "New" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByPlaceholderText("Story title (optional)")).not.toBeInTheDocument();
    });

    it("reopens to the list after being closed from the create form", async () => {
      const user = userEvent.setup();
      const { rerender } = render(<JournalSheet {...defaultProps} role="traveler" />);

      await user.click(screen.getByRole("button", { name: "New" }));
      expect(screen.getByPlaceholderText("Story title (optional)")).toBeInTheDocument();

      rerender(<JournalSheet {...defaultProps} open={false} role="traveler" />);
      rerender(<JournalSheet {...defaultProps} open role="traveler" />);

      expect(screen.queryByPlaceholderText("Story title (optional)")).not.toBeInTheDocument();
      expect(screen.getByText("No story entries yet.")).toBeInTheDocument();
    });

    it("restores the create form with the picked coordinate after map picking ends", async () => {
      const user = userEvent.setup();
      let pickCallback: ((coord: { lat: number; lon: number }) => void) | undefined;
      const onRequestCoordinatePick = vi.fn((callback) => {
        pickCallback = callback;
      });
      const { rerender } = render(
        <JournalSheet
          {...defaultProps}
          role="traveler"
          onRequestCoordinatePick={onRequestCoordinatePick}
        />,
      );

      await user.click(screen.getByRole("button", { name: "New" }));
      await user.click(screen.getByRole("button", { name: /pick location on map/i }));
      rerender(
        <JournalSheet
          {...defaultProps}
          role="traveler"
          onRequestCoordinatePick={onRequestCoordinatePick}
          isPickingCoordinate
        />,
      );

      act(() => {
        pickCallback?.({ lat: 47.61, lon: -122.33 });
      });
      rerender(
        <JournalSheet
          {...defaultProps}
          role="traveler"
          onRequestCoordinatePick={onRequestCoordinatePick}
          isPickingCoordinate={false}
        />,
      );

      expect(screen.getByPlaceholderText("Story title (optional)")).toBeInTheDocument();
      expect(screen.getByText("47.61000, -122.33000")).toBeInTheDocument();
    });

    it("submitting the form calls addCheckpoint with showInStory=true and source=inline_form", async () => {
      const user = userEvent.setup();
      render(<JournalSheet {...defaultProps} role="traveler" />);
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

    it("uploads a photo before creating an inline Story", async () => {
      const user = userEvent.setup();
      const addCheckpoint = vi.fn().mockResolvedValue("new-cp-id");
      const generateUploadUrl = vi.fn().mockResolvedValue("https://upload.example.test");
      vi.mocked(convexReact.useMutation).mockImplementation((ref: unknown) => {
        if (ref === tripcastApi.checkpoints.generateStoryImageUploadUrl) {
          return generateUploadUrl as any;
        }
        return addCheckpoint as any;
      });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ storageId: "image-1" }),
      }));
      // jsdom has no real image decoder — make `new Image()` fire `error` so
      // compression rejects and the upload falls back to the original blob.
      class FakeImage {
        onload?: () => void;
        onerror?: () => void;
        set src(_v: string) { queueMicrotask(() => this.onerror?.()); }
      }
      vi.stubGlobal("Image", FakeImage as unknown as typeof Image);

      render(<JournalSheet {...defaultProps} role="traveler" />);
      await user.click(screen.getByRole("button", { name: "New" }));
      await user.upload(
        screen.getByLabelText("Add photo"),
        new File(["image-bytes"], "story.png", { type: "image/png" }),
      );
      await user.click(screen.getByRole("button", { name: "Add to Journal" }));

      expect(generateUploadUrl).toHaveBeenCalledWith({ token: "test-token" });
      expect(addCheckpoint).toHaveBeenCalledWith(expect.objectContaining({ imageId: "image-1" }));
      vi.unstubAllGlobals();
    });
  });

  describe("Traveler role — Story rows (no swipe; edit/delete moved to the detail sheet)", () => {
    const travelerEvent = makeEvent({ _id: "evt1", checkpointId: "cp1", title: "Trail stop" });
    const travelerProps = { ...defaultProps, role: "traveler" as const, events: [travelerEvent] };

    it("does not render swipe/row-action affordances", () => {
      render(<JournalSheet {...travelerProps} />);
      expect(screen.queryByRole("button", { name: "Show row actions" })).not.toBeInTheDocument();
    });

    it("a Story row still opens the detail on tap", () => {
      const onStorySelect = vi.fn();
      render(<JournalSheet {...travelerProps} onStorySelect={onStorySelect} />);
      fireEvent.click(screen.getByRole("button", { name: /check in: trail stop/i }));
      expect(onStorySelect).toHaveBeenCalledWith(travelerEvent);
    });
  });

});

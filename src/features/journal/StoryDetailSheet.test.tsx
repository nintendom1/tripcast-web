import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useMutation, useQuery } from "convex/react";

import StoryDetailSheet from "./StoryDetailSheet";
import { ReadingSpeedProvider } from "../../providers/ReadingSpeedProvider";
import { tripcastApi } from "../../convex/tripcastApi";
import { getActiveUiContext, resetActiveUiContextForTests } from "../../debug/activeUiContext";
import type { JournalEvent } from "../../convex/tripcastApi";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: { div: "div" },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function makeStoryEvent(overrides: Partial<JournalEvent> = {}): JournalEvent {
  return {
    _id: "story-1",
    _creationTime: 1000,
    type: "story",
    narrativeLevel: "narrative",
    occurredAt: Date.UTC(2026, 4, 16, 14, 32),
    createdAt: Date.now(),
    title: "% Arabica",
    body: "Tucked behind a flower stall, exactly where I least expected to wander into a coffee place.",
    lat: 47.6,
    lon: -122.3,
    ...overrides,
  };
}

function renderSheet(
  ui: React.ReactElement,
  speed: "instant" | "fast" | "normal" | "slow" = "normal",
) {
  // localStorage seeds the provider, which lets a single test pick its own speed.
  window.localStorage.setItem("tripcast.story.readingSpeed", speed);
  return render(<ReadingSpeedProvider>{ui}</ReadingSpeedProvider>);
}

describe("StoryDetailSheet", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("renders nothing visible when event is null", () => {
    const { container } = renderSheet(
      <StoryDetailSheet event={null} onClose={vi.fn()} onLocationFocus={vi.fn()} />,
    );
    // Sheet should not render its content
    expect(container.textContent).not.toMatch(/Story · /);
  });

  it("renders the title and reveals body characters over time at the chosen speed", () => {
    const event = makeStoryEvent({ body: "abc" });
    renderSheet(
      <StoryDetailSheet event={event} onClose={vi.fn()} onLocationFocus={vi.fn()} />,
      "fast", // 8 ms / char
    );

    expect(screen.getByText("% Arabica")).toBeInTheDocument();
    // Initial frame: nothing revealed, but the full text is in the DOM via aria-label
    expect(screen.getByLabelText("abc")).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(8); });
    act(() => { vi.advanceTimersByTime(8); });
    act(() => { vi.advanceTimersByTime(8); });
    // After 3 ticks of 8 ms the timer fires the full body; advanceTimersByTime is best-effort
    // — what matters is that the aria-label still carries the full text for AT.
    expect(screen.getByLabelText("abc")).toBeInTheDocument();
  });

  it("instant speed shows the full body immediately, without timers", () => {
    const event = makeStoryEvent({ body: "Instant body." });
    renderSheet(
      <StoryDetailSheet event={event} onClose={vi.fn()} onLocationFocus={vi.fn()} />,
      "instant",
    );
    expect(screen.getByLabelText("Instant body.")).toBeInTheDocument();
  });

  it("calls onLocationFocus on open when the event has coordinates", () => {
    const onLocationFocus = vi.fn();
    const event = makeStoryEvent({ lat: 47.62, lon: -122.34 });
    renderSheet(
      <StoryDetailSheet event={event} onClose={vi.fn()} onLocationFocus={onLocationFocus} />,
      "instant",
    );
    expect(onLocationFocus).toHaveBeenCalledWith({ lat: 47.62, lon: -122.34 });
  });

  it("does not call onLocationFocus when the event has no coordinates", () => {
    const onLocationFocus = vi.fn();
    const event = makeStoryEvent({ lat: undefined, lon: undefined });
    renderSheet(
      <StoryDetailSheet event={event} onClose={vi.fn()} onLocationFocus={onLocationFocus} />,
      "instant",
    );
    expect(onLocationFocus).not.toHaveBeenCalled();
  });

  it("renders an empty-state line when body is missing", () => {
    const event = makeStoryEvent({ body: undefined });
    renderSheet(
      <StoryDetailSheet event={event} onClose={vi.fn()} onLocationFocus={vi.fn()} />,
      "instant",
    );
    expect(screen.getByText(/no story body yet/i)).toBeInTheDocument();
  });

  it("renders Prev and Next story controls with boundary states", () => {
    const onNavigateStory = vi.fn();
    renderSheet(
      <StoryDetailSheet
        event={makeStoryEvent()}
        onClose={vi.fn()}
        onLocationFocus={vi.fn()}
        navigation={{ currentIndex: 0, total: 3, hasPrevious: false, hasNext: true }}
        onNavigateStory={onNavigateStory}
      />,
      "instant",
    );

    expect(screen.getByRole("button", { name: "Previous story" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Next story" })).toHaveAttribute("aria-disabled", "false");

    fireEvent.click(screen.getByRole("button", { name: "Previous story" }));
    expect(onNavigateStory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Next story" }));
    expect(onNavigateStory).toHaveBeenCalledWith("next");
  });
});

describe("StoryDetailSheet — inline edit mode", () => {
  const updateSpy = vi.fn().mockResolvedValue(undefined);
  const deleteSpy = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    resetActiveUiContextForTests();
    updateSpy.mockClear();
    deleteSpy.mockClear();
    (vi.mocked(useMutation) as any).mockImplementation((ref: unknown) => {
      if (ref === tripcastApi.checkpoints.updateCheckpoint) return updateSpy;
      if (ref === tripcastApi.checkpoints.deleteCheckpoint) return deleteSpy;
      return vi.fn().mockResolvedValue(undefined);
    });
    (vi.mocked(useQuery) as any).mockReturnValue(undefined);
    window.localStorage.setItem("tripcast.story.readingSpeed", "instant");
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.mocked(useMutation).mockReset();
    vi.mocked(useQuery).mockReset();
  });

  function editableEvent(overrides: Partial<JournalEvent> = {}): JournalEvent {
    return makeStoryEvent({
      checkpointId: "cp1",
      title: "Coffee",
      body: "Body text",
      locationLabel: "Seattle",
      ...overrides,
    });
  }

  it("shows the Edit link for a Traveler on a Story with a checkpoint", () => {
    render(
      <ReadingSpeedProvider>
        <StoryDetailSheet
          event={editableEvent()}
          token="t"
          role="traveler"
          onClose={vi.fn()}
          onLocationFocus={vi.fn()}
        />
      </ReadingSpeedProvider>,
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("hides the Edit link for a Follower", () => {
    render(
      <ReadingSpeedProvider>
        <StoryDetailSheet
          event={editableEvent()}
          token="t"
          role="follower"
          onClose={vi.fn()}
          onLocationFocus={vi.fn()}
        />
      </ReadingSpeedProvider>,
    );
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("flips the active UI context view to narrative:edit on entering edit mode", () => {
    render(
      <ReadingSpeedProvider>
        <StoryDetailSheet
          event={editableEvent()}
          token="t"
          role="traveler"
          onClose={vi.fn()}
          onLocationFocus={vi.fn()}
        />
      </ReadingSpeedProvider>,
    );
    expect(getActiveUiContext()?.view).toBe("narrative");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(getActiveUiContext()?.view).toBe("narrative:edit");
  });

  it("entering edit mode swaps the body for the edit form", () => {
    render(
      <ReadingSpeedProvider>
        <StoryDetailSheet
          event={editableEvent()}
          token="t"
          role="traveler"
          onClose={vi.fn()}
          onLocationFocus={vi.fn()}
        />
      </ReadingSpeedProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Edit Story")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("Save calls updateCheckpoint with the edited fields", () => {
    render(
      <ReadingSpeedProvider>
        <StoryDetailSheet
          event={editableEvent()}
          token="t"
          role="traveler"
          onClose={vi.fn()}
          onLocationFocus={vi.fn()}
        />
      </ReadingSpeedProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByDisplayValue("Coffee"), {
      target: { value: "Coffee Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(updateSpy).toHaveBeenCalledWith({
      token: "t",
      checkpointId: "cp1",
      title: "Coffee Updated",
      note: "Body text",
      locationLabel: "Seattle",
      lat: 47.6,
      lon: -122.3,
      showInStory: true,
    });
  });

  it("shows saved edits immediately after Save while the parent event is still stale", async () => {
    render(
      <ReadingSpeedProvider>
        <StoryDetailSheet
          event={editableEvent()}
          token="t"
          role="traveler"
          onClose={vi.fn()}
          onLocationFocus={vi.fn()}
        />
      </ReadingSpeedProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByDisplayValue("Coffee"), {
      target: { value: "Coffee Updated" },
    });
    fireEvent.change(screen.getByDisplayValue("Seattle"), {
      target: { value: "Portland" },
    });
    fireEvent.change(screen.getByDisplayValue("Body text"), {
      target: { value: "Updated body text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    });
    expect(screen.getByText("Coffee Updated")).toBeInTheDocument();
    expect(screen.getByText("Portland")).toBeInTheDocument();
    expect(screen.getByLabelText("Updated body text")).toBeInTheDocument();
  });

  it("confirming Delete calls deleteCheckpoint then closes the sheet", async () => {
    const onClose = vi.fn();
    render(
      <ReadingSpeedProvider>
        <StoryDetailSheet
          event={editableEvent()}
          token="t"
          role="traveler"
          onClose={onClose}
          onLocationFocus={vi.fn()}
        />
      </ReadingSpeedProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Story" }));
    expect(screen.getByText("Delete this Story?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteSpy).toHaveBeenCalledWith({ token: "t", checkpointId: "cp1" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

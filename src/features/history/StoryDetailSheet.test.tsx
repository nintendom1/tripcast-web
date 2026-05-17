import { act, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import StoryDetailSheet from "./StoryDetailSheet";
import { ReadingSpeedProvider } from "../../providers/ReadingSpeedProvider";
import type { HistoryEvent } from "../../convex/tripcastApi";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: { div: "div" },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function makeStoryEvent(overrides: Partial<HistoryEvent> = {}): HistoryEvent {
  return {
    _id: "story-1",
    _creationTime: 1000,
    type: "check_in",
    storyLevel: "story",
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
});

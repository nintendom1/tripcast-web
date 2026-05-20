import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CheckInDetailSheet from "./CheckInDetailSheet";
import type { HistoryEvent } from "../../convex/tripcastApi";

vi.mock("framer-motion", () => ({
  motion: { div: "div" },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function makeEvent(overrides: Partial<HistoryEvent> = {}): HistoryEvent {
  return {
    _id: "id1",
    _creationTime: 1000,
    type: "check_in",
    storyLevel: "story",
    occurredAt: new Date("2026-05-13T14:30:00").getTime(),
    createdAt: Date.now(),
    title: "Test Pin",
    ...overrides,
  };
}

describe("CheckInDetailSheet", () => {
  it("renders nothing when event is null", () => {
    const { container } = render(
      <CheckInDetailSheet event={null} onClose={vi.fn()} onLocationFocus={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the event title", () => {
    render(
      <CheckInDetailSheet
        event={makeEvent({ title: "Capitol Hill" })}
        onClose={vi.fn()}
        onLocationFocus={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Capitol Hill" })).toBeInTheDocument();
  });

  it("falls back to 'Story' heading when title is absent", () => {
    render(
      <CheckInDetailSheet
        event={makeEvent({ title: undefined })}
        onClose={vi.fn()}
        onLocationFocus={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Story" })).toBeInTheDocument();
  });

  it("shows locationLabel when present", () => {
    render(
      <CheckInDetailSheet
        event={makeEvent({ locationLabel: "Pike Place Market" })}
        onClose={vi.fn()}
        onLocationFocus={vi.fn()}
      />,
    );
    expect(screen.getByText("Pike Place Market")).toBeInTheDocument();
  });

  it("shows the full note body", () => {
    render(
      <CheckInDetailSheet
        event={makeEvent({ body: "Had an amazing time here." })}
        onClose={vi.fn()}
        onLocationFocus={vi.fn()}
      />,
    );
    expect(screen.getByText("Had an amazing time here.")).toBeInTheDocument();
  });

  it("shows state section when state fields are present", () => {
    render(
      <CheckInDetailSheet
        event={makeEvent({ moodValue: "good", energyLevel: "medium" })}
        onClose={vi.fn()}
        onLocationFocus={vi.fn()}
      />,
    );
    expect(screen.getByText(/state at this story/i)).toBeInTheDocument();
  });

  it("does not show state section when no state fields", () => {
    render(
      <CheckInDetailSheet
        event={makeEvent()}
        onClose={vi.fn()}
        onLocationFocus={vi.fn()}
      />,
    );
    expect(screen.queryByText(/state at this story/i)).not.toBeInTheDocument();
  });

  it("shows statusNote in state section", () => {
    render(
      <CheckInDetailSheet
        event={makeEvent({ statusNote: "Feeling refreshed" })}
        onClose={vi.fn()}
        onLocationFocus={vi.fn()}
      />,
    );
    expect(screen.getByText(/Feeling refreshed/)).toBeInTheDocument();
  });

  it("calls onLocationFocus on mount when lat/lon are present", () => {
    const onLocationFocus = vi.fn();
    render(
      <CheckInDetailSheet
        event={makeEvent({ lat: 47.6097, lon: -122.3422 })}
        onClose={vi.fn()}
        onLocationFocus={onLocationFocus}
      />,
    );
    expect(onLocationFocus).toHaveBeenCalledWith({ lat: 47.6097, lon: -122.3422 });
  });

  it("does not call onLocationFocus when lat/lon are absent", () => {
    const onLocationFocus = vi.fn();
    render(
      <CheckInDetailSheet
        event={makeEvent()}
        onClose={vi.fn()}
        onLocationFocus={onLocationFocus}
      />,
    );
    expect(onLocationFocus).not.toHaveBeenCalled();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <CheckInDetailSheet
        event={makeEvent()}
        onClose={onClose}
        onLocationFocus={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

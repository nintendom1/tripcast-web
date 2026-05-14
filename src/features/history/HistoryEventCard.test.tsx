import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import HistoryEventCard from "./HistoryEventCard";
import type { HistoryEvent } from "../../convex/tripcastApi";

function makeEvent(overrides: Partial<HistoryEvent> = {}): HistoryEvent {
  return {
    _id: "id1",
    _creationTime: 1000,
    type: "check_in",
    storyLevel: "story",
    occurredAt: Date.now(),
    createdAt: Date.now(),
    title: "Test Pin",
    ...overrides,
  };
}

describe("HistoryEventCard — check_in", () => {
  it("renders as a button", () => {
    render(
      <HistoryEventCard
        event={makeEvent()}
        onCheckInSelect={null}
        onLocationFocus={null}
      />,
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls onCheckInSelect when clicked", () => {
    const onCheckInSelect = vi.fn();
    const event = makeEvent({ title: "My Pin" });
    render(
      <HistoryEventCard
        event={event}
        onCheckInSelect={onCheckInSelect}
        onLocationFocus={null}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onCheckInSelect).toHaveBeenCalledWith(event);
  });

  it("does not throw when onCheckInSelect is null", () => {
    render(
      <HistoryEventCard
        event={makeEvent()}
        onCheckInSelect={null}
        onLocationFocus={null}
      />,
    );
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
  });

  it("shows title and body", () => {
    render(
      <HistoryEventCard
        event={makeEvent({ title: "Capitol Hill", body: "Great view" })}
        onCheckInSelect={null}
        onLocationFocus={null}
      />,
    );
    expect(screen.getByText("Capitol Hill")).toBeInTheDocument();
    expect(screen.getByText("Great view")).toBeInTheDocument();
  });

  it("shows locationLabel when present", () => {
    render(
      <HistoryEventCard
        event={makeEvent({ locationLabel: "Pike Place Market" })}
        onCheckInSelect={null}
        onLocationFocus={null}
      />,
    );
    expect(screen.getByText("Pike Place Market")).toBeInTheDocument();
  });

  it("shows mood emoji (aria-hidden span) when state data is present", () => {
    const { container } = render(
      <HistoryEventCard
        event={makeEvent({ moodValue: "good", energyLevel: "medium" })}
        onCheckInSelect={null}
        onLocationFocus={null}
      />,
    );
    const emojiSpan = container.querySelector("[aria-hidden='true']");
    expect(emojiSpan).toBeInTheDocument();
  });

  it("does not show emoji span when no state data", () => {
    const { container } = render(
      <HistoryEventCard
        event={makeEvent()}
        onCheckInSelect={null}
        onLocationFocus={null}
      />,
    );
    expect(container.querySelector("[aria-hidden='true']")).not.toBeInTheDocument();
  });

  it("does not render a Focus on map button", () => {
    render(
      <HistoryEventCard
        event={makeEvent({ lat: 47.6, lon: -122.3 })}
        onCheckInSelect={null}
        onLocationFocus={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /focus on map/i })).not.toBeInTheDocument();
  });
});

describe("HistoryEventCard — vote / challenge", () => {
  it("renders a div (not a button) for a vote event", () => {
    const { container } = render(
      <HistoryEventCard
        event={makeEvent({ type: "route_vote_resolved", storyLevel: "story" })}
        onCheckInSelect={null}
        onLocationFocus={null}
      />,
    );
    expect(container.querySelector("button")).not.toBeInTheDocument();
  });

  it("shows Focus on map when lat/lon present and onLocationFocus provided", () => {
    const onLocationFocus = vi.fn();
    render(
      <HistoryEventCard
        event={makeEvent({ type: "route_vote_resolved", lat: 47.6, lon: -122.3, title: "Vote" })}
        onCheckInSelect={null}
        onLocationFocus={onLocationFocus}
      />,
    );
    const btn = screen.getByRole("button", { name: /focus on map/i });
    fireEvent.click(btn);
    expect(onLocationFocus).toHaveBeenCalledWith({ lat: 47.6, lon: -122.3 });
  });

  it("does not show Focus on map when onLocationFocus is null", () => {
    render(
      <HistoryEventCard
        event={makeEvent({ type: "route_vote_resolved", lat: 47.6, lon: -122.3 })}
        onCheckInSelect={null}
        onLocationFocus={null}
      />,
    );
    expect(screen.queryByRole("button", { name: /focus on map/i })).not.toBeInTheDocument();
  });

  it("does not show Focus on map when lat/lon are absent", () => {
    const onLocationFocus = vi.fn();
    render(
      <HistoryEventCard
        event={makeEvent({ type: "challenge_completed" })}
        onCheckInSelect={null}
        onLocationFocus={onLocationFocus}
      />,
    );
    expect(screen.queryByRole("button", { name: /focus on map/i })).not.toBeInTheDocument();
  });

  it("shows the event type label", () => {
    render(
      <HistoryEventCard
        event={makeEvent({ type: "challenge_completed" })}
        onCheckInSelect={null}
        onLocationFocus={null}
      />,
    );
    expect(screen.getByText("Challenge Completed")).toBeInTheDocument();
  });
});

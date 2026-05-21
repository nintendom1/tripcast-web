import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AchievementEvent, ScoreSummary } from "../../convex/tripcastApi";
import AchievementsSheet from "./AchievementsSheet";

vi.mock("../../components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetCloseButton: () => <button type="button">Close</button>,
  SheetGrabber: () => <div />,
  SheetKicker: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

function makeEvent(overrides: Partial<AchievementEvent> = {}): AchievementEvent {
  return {
    _id: overrides._id ?? "e1",
    _creationTime: 1000,
    isDev: false,
    eventType: "daily_visit",
    points: 1,
    uniqueKey: "daily_visit:u1:2026-05-20",
    sourceType: "visit",
    title: "+1 Daily Visit",
    message: "You checked in today.",
    createdAt: Date.UTC(2026, 4, 20),
    ...overrides,
  };
}

function makeSummary(overrides: Partial<ScoreSummary> = {}): ScoreSummary {
  return {
    total: 3,
    count: 2,
    isDev: false,
    unseenCount: 0,
    recent: [
      makeEvent({ _id: "e1" }),
      makeEvent({
        _id: "e2",
        eventType: "mission_proposed_weekly",
        title: "+1 Mission Created",
        message: "You created a Mission this week.",
      }),
    ],
    ...overrides,
  };
}

describe("AchievementsSheet", () => {
  it("shows the total score and point log", () => {
    render(
      <AchievementsSheet open summary={makeSummary()} onOpenChange={vi.fn()} />,
    );
    expect(screen.getByText(/3 points/)).toBeInTheDocument();
    expect(screen.getByText("+1 Daily Visit")).toBeInTheDocument();
    expect(screen.getByText("+1 Mission Created")).toBeInTheDocument();
  });

  it("shows the developer-testing label only when isDev", () => {
    const { rerender } = render(
      <AchievementsSheet open summary={makeSummary({ isDev: false })} onOpenChange={vi.fn()} />,
    );
    expect(
      screen.queryByText("Testing Follower achievements as Traveler"),
    ).not.toBeInTheDocument();

    rerender(
      <AchievementsSheet open summary={makeSummary({ isDev: true })} onOpenChange={vi.fn()} />,
    );
    expect(
      screen.getByText("Testing Follower achievements as Traveler"),
    ).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no events", () => {
    render(
      <AchievementsSheet
        open
        summary={makeSummary({ total: 0, count: 0, recent: [] })}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/No achievements yet/)).toBeInTheDocument();
  });
});

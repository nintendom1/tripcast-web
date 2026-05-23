import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { AchievementEvent, ScoreSummary } from "../../convex/tripcastApi";
import AchievementsSheet from "./AchievementsSheet";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: () => vi.fn(),
}));

vi.mock("../../components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetCloseButton: () => <button type="button">Close</button>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("./BadgeBoard", () => ({
  __esModule: true,
  default: ({ badges }: { badges: any[] }) => (
    <div data-testid="badge-board">
      {badges.map((b) => (
        <div key={b.badgeType}>{b.earned ? "Earned" : "Locked"}: {b.name}</div>
      ))}
    </div>
  ),
  BADGE_COLOR: {},
}));

const mockUseQuery = vi.mocked(useQuery);

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
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return empty results to avoid loading states in basic tests
    mockUseQuery.mockImplementation((api, _args?) => {
      if (api === tripcastApi.badges.getMyBadges) return { badges: [], isDev: false };
      if (api === tripcastApi.badges.listBadgeDefinitions) return [];
      return undefined;
    });
  });

  it("shows the total score and point log", () => {
    render(
      <AchievementsSheet open summary={makeSummary()} token="t" onOpenChange={vi.fn()} />,
    );
    expect(screen.getByText(/3 points/)).toBeInTheDocument();
    expect(screen.getByText("+1 Daily Visit")).toBeInTheDocument();
    expect(screen.getByText("+1 Mission Created")).toBeInTheDocument();
  });

  it("shows the developer-testing label only when isDev", () => {
    const { rerender } = render(
      <AchievementsSheet open summary={makeSummary({ isDev: false })} token="t" onOpenChange={vi.fn()} />,
    );
    expect(
      screen.queryByText("Testing Follower achievements as Traveler"),
    ).not.toBeInTheDocument();

    rerender(
      <AchievementsSheet open summary={makeSummary({ isDev: true })} token="t" onOpenChange={vi.fn()} />,
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
        token="t"
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/No achievements yet/)).toBeInTheDocument();
  });

  it("shows loading state for badges", () => {
    mockUseQuery.mockReturnValue(undefined);
    render(
      <AchievementsSheet open summary={makeSummary()} token="t" onOpenChange={vi.fn()} />,
    );
    expect(screen.getByText("Loading badges…")).toBeInTheDocument();
  });

  it("falls back to catalog when user has no scoring identity", () => {
    mockUseQuery.mockImplementation((api, _args?) => {
      if (api === tripcastApi.badges.listBadgeDefinitions) {
        return [{ badgeType: "popular", name: "Popular", emoji: "🔥", description: "Test" }];
      }
      return undefined;
    });

    render(
      <AchievementsSheet open summary={null} token="t" onOpenChange={vi.fn()} />,
    );

    // Should skip board query and show catalog as locked
    expect(screen.getByText("Locked: Popular")).toBeInTheDocument();
    expect(screen.queryByText("Loading badges…")).not.toBeInTheDocument();
  });

  it("displays earned badges when board is available", () => {
    mockUseQuery.mockImplementation((api, _args?) => {
      if (api === tripcastApi.badges.getMyBadges) {
        return {
          isDev: false,
          badges: [
            {
              badgeType: "life_changing",
              name: "Life Changing",
              emoji: "✨",
              description: "Test",
              earned: true,
              count: 1,
              awards: [],
            },
          ],
        };
      }
      return [];
    });

    render(
      <AchievementsSheet open summary={makeSummary()} token="t" onOpenChange={vi.fn()} />,
    );

    expect(screen.getByText("Earned: Life Changing")).toBeInTheDocument();
  });
});

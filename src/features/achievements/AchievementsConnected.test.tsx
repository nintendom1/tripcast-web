import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { AchievementEvent, ScoreSummary } from "../../convex/tripcastApi";
import AchievementsConnected from "./AchievementsConnected";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: { div: "div" },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../providers/MusicProvider", () => ({
  useMusicSafe: () => ({ sfx: vi.fn() }),
}));

// Keep the sheet a simple stub — its content is covered by AchievementsSheet.test.tsx.
vi.mock("./AchievementsSheet", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="ach-sheet">sheet</div> : null,
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

function setup({
  summary,
  untoasted = [],
}: {
  summary: ScoreSummary | null | undefined;
  untoasted?: AchievementEvent[];
}) {
  const markToasted = vi.fn().mockResolvedValue(null);
  const markSeen = vi.fn().mockResolvedValue(null);

  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.scoring.getScoreSummary) return summary;
    if (ref === tripcastApi.scoring.listUntoastedAchievements) return untoasted;
    return undefined;
  });
  vi.mocked(convexReact.useMutation).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.scoring.markAchievementsToasted) return markToasted as any;
    if (ref === tripcastApi.scoring.markAchievementsSeen) return markSeen as any;
    return vi.fn().mockResolvedValue(null) as any;
  });

  return { markToasted, markSeen };
}

const followerSummary: ScoreSummary = {
  total: 3,
  count: 3,
  isDev: false,
  unseenCount: 2,
  recent: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AchievementsConnected", () => {
  it("renders the score button with an unread dot for a user with points", () => {
    setup({ summary: followerSummary });
    render(<AchievementsConnected token="t" />);

    const button = screen.getByRole("button", { name: /Achievements\. 3 points\. 2 new\./ });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("3");
  });

  it("renders nothing (no button) when there is no scoring identity", () => {
    setup({ summary: null });
    render(<AchievementsConnected token="t" />);
    expect(screen.queryByRole("button", { name: /Achievements/ })).not.toBeInTheDocument();
  });

  it("opens the sheet and marks achievements seen on click", async () => {
    const { markSeen } = setup({ summary: followerSummary });
    render(<AchievementsConnected token="t" />);

    await userEvent.click(screen.getByRole("button", { name: /Achievements/ }));

    expect(screen.getByTestId("ach-sheet")).toBeInTheDocument();
    expect(markSeen).toHaveBeenCalledWith({ token: "t" });
  });

  it("shows a toast for untoasted achievements and marks them toasted", async () => {
    const { markToasted } = setup({
      summary: followerSummary,
      untoasted: [makeEvent({ _id: "e1" })],
    });
    render(<AchievementsConnected token="t" />);

    expect(await screen.findByText("+1 Daily Visit")).toBeInTheDocument();
    await waitFor(() => {
      expect(markToasted).toHaveBeenCalledWith({ token: "t", ids: ["e1"] });
    });
  });

  it("groups multiple untoasted achievements into one toast", async () => {
    const { markToasted } = setup({
      summary: followerSummary,
      untoasted: [
        makeEvent({ _id: "e1", points: 1 }),
        makeEvent({ _id: "e2", points: 1 }),
      ],
    });
    render(<AchievementsConnected token="t" />);

    expect(await screen.findByText("You earned 2 achievements")).toBeInTheDocument();
    expect(screen.getByText("+2 points")).toBeInTheDocument();
    await waitFor(() => {
      expect(markToasted).toHaveBeenCalledWith({ token: "t", ids: ["e1", "e2"] });
    });
  });
});

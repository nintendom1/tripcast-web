import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

import { tripcastApi, type VisibleRouteVote } from "../../convex/tripcastApi";
import VoteTimeSplash, { selectVoteTimeSplashTarget } from "./VoteTimeSplash";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: {
    button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
    span: ({ children, ...props }: HTMLAttributes<HTMLSpanElement>) => (
      <span {...props}>{children}</span>
    ),
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const BASE_TIME = new Date("2026-05-25T12:00:00Z").getTime();

function makeVote(overrides: Partial<VisibleRouteVote> = {}): VisibleRouteVote {
  return {
    _id: "vote1",
    title: "Ferry or ramen",
    effectiveStatus: "active",
    expiresAt: BASE_TIME + 2 * 60 * 60 * 1000,
    resultsVisibility: "before_voting",
    options: [],
    visibleComments: [],
    ...overrides,
  };
}

function mockVotes(votes: VisibleRouteVote[] | undefined) {
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    if (ref === tripcastApi.routeVotes.listVisibleRouteVotes) return votes;
    return undefined;
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("selectVoteTimeSplashTarget", () => {
  it("selects an unseen active vote inside the final 24 hours", () => {
    const vote = makeVote();
    expect(selectVoteTimeSplashTarget([vote], BASE_TIME, null)?._id).toBe("vote1");
  });

  it("ignores votes that are seen, submitted, closed, too early, or dismissed", () => {
    expect(
      selectVoteTimeSplashTarget([makeVote({ myViewState: { seenAt: BASE_TIME } })], BASE_TIME, null),
    ).toBeNull();
    expect(
      selectVoteTimeSplashTarget(
        [makeVote({ mySubmission: { _id: "sub1", selectedOptionIds: [], commentVisibility: "public", anonymous: false } })],
        BASE_TIME,
        null,
      ),
    ).toBeNull();
    expect(selectVoteTimeSplashTarget([makeVote({ effectiveStatus: "closed" })], BASE_TIME, null)).toBeNull();
    expect(
      selectVoteTimeSplashTarget([makeVote({ expiresAt: BASE_TIME + 25 * 60 * 60 * 1000 })], BASE_TIME, null),
    ).toBeNull();
    expect(selectVoteTimeSplashTarget([makeVote()], BASE_TIME, "vote1")).toBeNull();
  });
});

describe("VoteTimeSplash", () => {
  it("shows the one-second splash and opens votes when tapped", () => {
    mockVotes([makeVote()]);
    const onOpenVotes = vi.fn();

    render(<VoteTimeSplash token="token" enabled onOpenVotes={onOpenVotes} />);

    const splash = screen.getByRole("button", { name: /cast your vote: ferry or ramen/i });
    expect(screen.getByText("Cast your Vote")).toBeInTheDocument();

    fireEvent.click(splash);

    expect(onOpenVotes).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Cast your Vote")).not.toBeInTheDocument();
  });

  it("auto-dismisses after one second without marking the vote seen", () => {
    mockVotes([makeVote()]);

    render(<VoteTimeSplash token="token" enabled onOpenVotes={vi.fn()} />);
    expect(screen.getByText("Cast your Vote")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByText("Cast your Vote")).not.toBeInTheDocument();
  });

  it("skips the query while disabled", () => {
    mockVotes([makeVote()]);

    render(<VoteTimeSplash token="token" enabled={false} onOpenVotes={vi.fn()} />);

    expect(convexReact.useQuery).toHaveBeenCalledWith(
      tripcastApi.routeVotes.listVisibleRouteVotes,
      "skip",
    );
    expect(screen.queryByText("Cast your Vote")).not.toBeInTheDocument();
  });
});

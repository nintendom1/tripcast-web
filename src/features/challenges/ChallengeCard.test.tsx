import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Challenge } from "../../convex/tripcastApi";
import ChallengeCard from "./ChallengeCard";

function makeChallenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    _id: "challenge-1",
    _creationTime: 1,
    title: "Try a tiny neighborhood bakery with a surprisingly long name",
    status: "in_progress",
    source: "traveler",
    createdAt: 1,
    updatedAt: 1,
    createdBySessionId: "session-1",
    updatedBySessionId: "session-1",
    ...overrides,
  } as Challenge;
}

describe("ChallengeCard", () => {
  it("reserves space for swipe actions and truncates the status pill", () => {
    render(<ChallengeCard challenge={makeChallenge()} />);

    expect(screen.getByRole("button")).toHaveClass("pr-10");
    expect(screen.getByText("Try a tiny neighborhood bakery with a surprisingly long name"))
      .toHaveClass("min-w-0", "line-clamp-2");
    expect(screen.getByText("In progress")).toHaveClass("max-w-[48%]", "truncate");
  });
});

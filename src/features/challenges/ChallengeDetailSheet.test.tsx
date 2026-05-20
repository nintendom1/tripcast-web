import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import type { Challenge, TransactionInlineInput } from "../../convex/tripcastApi";
import { tripcastApi } from "../../convex/tripcastApi";
import ChallengeDetailSheet from "./ChallengeDetailSheet";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const inlineTransaction: TransactionInlineInput = {
  title: "Mission cost",
  category: "event",
  currencyCode: "USD",
  localAmount: 20,
  localCurrencyPerUsd: 1,
  countsTowardMeter: true,
  visibility: "public",
};

vi.mock("../travelfunds/TravelFundsInlineSection", () => ({
  default: function TravelFundsInlineSectionMock({
    onChange,
  }: {
    onChange: (value: { value: TransactionInlineInput }) => void;
  }) {
    useEffect(() => {
      onChange({ value: inlineTransaction });
    }, [onChange]);
    return <div data-testid="inline-funds" />;
  },
}));

const challenge: Challenge = {
  _id: "challenge-1",
  title: "Mission",
  status: "in_progress",
  source: "traveler",
  createdAt: 1,
  updatedAt: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(convexReact.useQuery).mockReturnValue(undefined as any);
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn().mockResolvedValue(null) as any);
});

describe("ChallengeDetailSheet — Mark In Progress button", () => {
  it.each(["proposed", "visible", "planned"] as const)(
    'shows "Mark In Progress" for %s missions (traveler)',
    (status) => {
      const ch: Challenge = { _id: "ch-1", title: "Mission", status, source: "follower", createdAt: 1, updatedAt: 1 };
      render(<ChallengeDetailSheet challenge={ch} token="t" role="traveler" onClose={vi.fn()} />);
      expect(screen.getByRole("button", { name: /Mark.*In Progress/i })).toBeInTheDocument();
    },
  );

  it("shows amber conflict prompt when another mission is already in progress", async () => {
    const user = userEvent.setup();
    const ch: Challenge = { _id: "ch-1", title: "Mission", status: "proposed", source: "follower", createdAt: 1, updatedAt: 1 };
    const other: Challenge = { _id: "ch-2", title: "Blocking Mission", status: "in_progress", source: "traveler", createdAt: 1, updatedAt: 1 };
    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      if (ref === tripcastApi.challenges.travelerListChallenges) return [other];
      return undefined;
    });
    render(<ChallengeDetailSheet challenge={ch} token="t" role="traveler" onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Mark.*In Progress/i }));
    expect(screen.getByText(/Blocking Mission/)).toBeInTheDocument();
  });
});

describe("ChallengeDetailSheet — Set Current Activity button", () => {
  const ch: Challenge = { _id: "ch-1", title: "Active Mission", status: "in_progress", source: "traveler", createdAt: 1, updatedAt: 1 };

  it("shows button when current activity is not linked to this mission", () => {
    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      if (ref === tripcastApi.currentActivity.travelerGetCurrentActivity) return { linkedChallengeId: "other-ch" };
      return undefined;
    });
    render(<ChallengeDetailSheet challenge={ch} token="t" role="traveler" onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Set Current Activity to This Mission" })).toBeInTheDocument();
  });

  it("hides button when current activity is already linked to this mission", () => {
    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      if (ref === tripcastApi.currentActivity.travelerGetCurrentActivity) return { linkedChallengeId: "ch-1" };
      return undefined;
    });
    render(<ChallengeDetailSheet challenge={ch} token="t" role="traveler" onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Set Current Activity to This Mission" })).not.toBeInTheDocument();
  });
});

describe("ChallengeDetailSheet", () => {
  it("passes inline Travel Funds data into Complete as story", async () => {
    const onCompleteAsStory = vi.fn();

    render(
      <ChallengeDetailSheet
        challenge={challenge}
        token="token"
        role="traveler"
        onClose={vi.fn()}
        onCompleteAsStory={onCompleteAsStory}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Complete as story" }));

    expect(onCompleteAsStory).toHaveBeenCalledWith(challenge, inlineTransaction);
  });
});

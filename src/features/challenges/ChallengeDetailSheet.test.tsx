import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import type { Challenge, TransactionInlineInput } from "../../convex/tripcastApi";
import ChallengeDetailSheet from "./ChallengeDetailSheet";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
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
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn().mockResolvedValue(null) as any);
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

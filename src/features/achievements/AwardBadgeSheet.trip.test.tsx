import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { BadgeAwardContext } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "../trips/tripTypes";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import AwardBadgeSheet from "./AwardBadgeSheet";

vi.mock("convex/react", () => ({ useMutation: vi.fn(), useQuery: vi.fn() }));
vi.mock("../../components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetCloseButton: () => <button type="button">CloseX</button>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetGradientHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const context: BadgeAwardContext = {
  sourceLabel: "Story",
  recipients: [
    { idTag: "alex", userId: "alex", devSessionId: null, displayName: "Alex", isDev: false, hiddenAttribution: false },
  ],
  badges: [{ badgeType: "tasty", name: "Tasty", emoji: "🍜", description: "food" }],
  awarded: [],
};
const award = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  award.mockResolvedValue({ awardedCount: 1, alreadyAwardedCount: 0, skippedNotAttributedCount: 0 });
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown, args: unknown) =>
    args !== "skip" && ref === tripcastApi.badges.travelerGetBadgeAwardContext ? context : undefined,
  );
  vi.mocked(convexReact.useMutation).mockImplementation(((ref: unknown) =>
    ref === tripcastApi.badges.travelerAwardBadges ? award : vi.fn()) as never);
});

const sheet = (value: Partial<TripContextValue>, open: boolean) => (
  <TripContextTestProvider value={value}>
    <AwardBadgeSheet open={open} token="t" sourceType="story" sourceId="s1" onOpenChange={vi.fn()} />
  </TripContextTestProvider>
);
const awardIt = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Tasty/ }));
  await user.click(screen.getByRole("button", { name: "Award Badge" }));
};

describe("AwardBadgeSheet on a viewed trip", () => {
  it("awards on any owned trip and names it", async () => {
    render(sheet(travelerViewingPrivately, true));
    expect(screen.getByTestId("trip-target-label")).toHaveTextContent("Other Trip");
    await awardIt();
    await waitFor(() => expect(award).toHaveBeenCalledWith(expect.objectContaining({ sourceId: "s1", tripId: "trip-other" })));
  });

  it("awards on the trip shown when it opens, not the trip shown when it mounted", async () => {
    const { rerender } = render(sheet(travelerFollowingCurrent, false));
    rerender(sheet(travelerViewingPrivately, false));
    rerender(sheet(travelerViewingPrivately, true));
    await awardIt();
    await waitFor(() => expect(award).toHaveBeenCalledWith(expect.objectContaining({ tripId: "trip-other" })));
  });

  it("sends today's request with multi-trip disabled", async () => {
    render(sheet({ multiTripEnabled: false }, true));
    await awardIt();
    await waitFor(() => expect(award).toHaveBeenCalled());
    expect(Object.keys(award.mock.calls[0][0]).sort()).toEqual(
      ["badgeType", "note", "recipients", "sourceId", "sourceType", "token"],
    );
  });
});

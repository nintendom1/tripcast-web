import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import type { TripCredits } from "../../convex/tripcastApi";
import EndTripSheet from "./EndTripSheet";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const credits: TripCredits = {
  ended: false,
  travelerName: "The Traveler",
  followers: [],
  leaderboard: [],
  totals: { points: 0, badges: 0, followers: 0 },
};

let endTripFn: ReturnType<typeof vi.fn>;
let reopenFn: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  endTripFn = vi.fn().mockResolvedValue(null);
  reopenFn = vi.fn().mockResolvedValue(null);
  // useMutation order inside EndTripSheet: travelerEndTrip, travelerReopenTrip.
  const fns = [endTripFn, reopenFn];
  let callCount = 0;
  vi.mocked(convexReact.useMutation).mockImplementation(() => fns[callCount++ % fns.length] as never);
  vi.mocked(convexReact.useQuery).mockReturnValue(credits as never);
});

describe("EndTripSheet", () => {
  it("ends the trip with the thank-you note and opens credits", async () => {
    const user = userEvent.setup();
    const onViewCredits = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <EndTripSheet token="t" open onOpenChange={onOpenChange} onViewCredits={onViewCredits} />,
    );

    await user.type(screen.getByRole("textbox"), "See you next time");
    await user.click(screen.getByRole("button", { name: /End trip & roll credits/i }));

    await waitFor(() =>
      expect(endTripFn).toHaveBeenCalledWith({ token: "t", thankYouNote: "See you next time" }),
    );
    expect(onViewCredits).toHaveBeenCalled();
  });
});

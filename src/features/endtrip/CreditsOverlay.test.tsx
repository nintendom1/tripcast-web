import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import type { TripCredits } from "../../convex/tripcastApi";
import CreditsOverlay from "./CreditsOverlay";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

const credits: TripCredits = {
  ended: true,
  endedAt: 123,
  thankYouNote: "Thanks, everyone!",
  travelerName: "The Traveler",
  followers: ["Robin", "Sam"],
  leaderboard: [
    { name: "Robin", points: 40, badges: 2 },
    { name: "The Traveler", points: 20, badges: 0 },
  ],
  totals: { points: 60, badges: 2, followers: 2 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(convexReact.useQuery).mockReturnValue(credits as never);
});

describe("CreditsOverlay", () => {
  it("rolls the credits with the thank-you note, names, and totals", () => {
    render(<CreditsOverlay token="t" onClose={vi.fn()} />);
    expect(screen.getByText("“Thanks, everyone!”")).toBeInTheDocument();
    expect(screen.getByText("Robin · Sam")).toBeInTheDocument();
    expect(screen.getByText(/60 points · 2 badges · 2 followers/)).toBeInTheDocument();
  });

  it("closes when the X is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CreditsOverlay token="t" onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Close credits" }));
    expect(onClose).toHaveBeenCalled();
  });
});

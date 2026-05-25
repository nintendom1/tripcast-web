import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi, type JournalEvent, type Mission, type TripCredits } from "../../convex/tripcastApi";
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

const events: JournalEvent[] = [
  {
    _id: "story-1",
    _creationTime: 3,
    type: "story",
    narrativeLevel: "narrative",
    occurredAt: 3,
    createdAt: 3,
    lat: 1,
    lon: 2,
  },
  {
    _id: "story-2",
    _creationTime: 1,
    type: "story",
    narrativeLevel: "narrative",
    occurredAt: 1,
    createdAt: 1,
  },
];

const missions: Mission[] = [
  {
    _id: "mission-1",
    title: "Find the overlook",
    status: "completed",
    source: "traveler",
    createdAt: 1,
    updatedAt: 2,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(convexReact.useQuery).mockImplementation((...args) => {
    const [query] = args;
    if (query === tripcastApi.endTrip.getTripCredits) return credits as never;
    if (query === tripcastApi.journalEvents.listJournalEvents) return events as never;
    if (
      query === tripcastApi.missions.travelerListMissions ||
      query === tripcastApi.missions.followerListMissions
    ) {
      return missions as never;
    }
    return undefined as never;
  });
});

describe("CreditsOverlay", () => {
  it("rolls the credits with the thank-you note, names, and totals", () => {
    render(<CreditsOverlay token="t" role="traveler" onClose={vi.fn()} />);
    expect(screen.getByText("“Thanks, everyone!”")).toBeInTheDocument();
    expect(screen.getByText("Robin · Sam")).toBeInTheDocument();
    expect(screen.getByText(/60 points · 2 badges · 2 followers/)).toBeInTheDocument();
    expect(screen.getByText(/2 Stories · 1 completed Missions · 1 mapped stops/)).toBeInTheDocument();
  });

  it("closes when the X is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CreditsOverlay token="t" role="follower" onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Close to map archive" }));
    expect(onClose).toHaveBeenCalled();
  });
});

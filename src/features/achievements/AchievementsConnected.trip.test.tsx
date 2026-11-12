import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { AchievementEvent, ScoreSummary } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "../trips/tripTypes";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import AchievementsConnected from "./AchievementsConnected";

vi.mock("convex/react", () => ({ useMutation: vi.fn(), useQuery: vi.fn() }));
vi.mock("framer-motion", () => ({
  motion: { div: "div" },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../../providers/MusicProvider", () => ({ useMusicSafe: () => ({ sfx: vi.fn() }) }));
vi.mock("./AchievementsSheet", () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="ach-sheet">sheet</div> : null),
}));

const summary: ScoreSummary = { total: 3, count: 3, isDev: false, unseenCount: 2, recent: [] };
const event = (id: string): AchievementEvent => ({
  _id: id,
  _creationTime: 1,
  isDev: false,
  eventType: "daily_visit",
  points: 1,
  uniqueKey: `k-${id}`,
  sourceType: "visit",
  title: `+1 ${id}`,
  message: "m",
  createdAt: 1,
});

const markToasted = vi.fn();
const markSeen = vi.fn();
let untoasted: AchievementEvent[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  untoasted = [];
  markToasted.mockResolvedValue(null);
  markSeen.mockResolvedValue(null);
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.scoring.getScoreSummary) return summary;
    if (ref === tripcastApi.scoring.listUntoastedAchievements) return untoasted;
    return undefined;
  });
  vi.mocked(convexReact.useMutation).mockImplementation(((ref: unknown) => {
    if (ref === tripcastApi.scoring.markAchievementsToasted) return markToasted;
    if (ref === tripcastApi.scoring.markAchievementsSeen) return markSeen;
    return vi.fn().mockResolvedValue(null);
  }) as never);
});

const connected = (value: Partial<TripContextValue>) => (
  <TripContextTestProvider value={value}>
    <AchievementsConnected token="t" />
  </TripContextTestProvider>
);

describe("AchievementsConnected on a viewed trip", () => {
  it("reads the viewed trip and marks the toasts it shows on that trip", async () => {
    untoasted = [event("e1")];
    render(connected(travelerViewingPrivately));
    await waitFor(() => expect(markToasted).toHaveBeenCalledWith({ token: "t", ids: ["e1"], tripId: "trip-other" }));
    const readArgs = vi.mocked(convexReact.useQuery).mock.calls
      .filter((c) => c[0] === tripcastApi.scoring.listUntoastedAchievements)
      .map((c) => c[1]);
    expect(readArgs.at(-1)).toEqual({ token: "t", tripId: "trip-other" });
  });

  it("marks on the trip on screen now, not the trip on screen when the app mounted", async () => {
    const { rerender } = render(connected(travelerFollowingCurrent));
    untoasted = [event("e2")];
    rerender(connected(travelerViewingPrivately));
    await waitFor(() => expect(markToasted).toHaveBeenCalledWith({ token: "t", ids: ["e2"], tripId: "trip-other" }));
  });

  it("marks seen on the trip on screen when the sheet opens", async () => {
    const { rerender } = render(connected(travelerFollowingCurrent));
    rerender(connected(travelerViewingPrivately));
    await userEvent.click(screen.getByRole("button", { name: /Achievements/ }));
    expect(markSeen).toHaveBeenCalledWith({ token: "t", tripId: "trip-other" });
  });

  it("sends today's requests with multi-trip disabled", async () => {
    untoasted = [event("e3")];
    render(connected({ multiTripEnabled: false }));
    await waitFor(() => expect(markToasted).toHaveBeenCalledWith({ token: "t", ids: ["e3"] }));
    await userEvent.click(screen.getByRole("button", { name: /Achievements/ }));
    expect(markSeen).toHaveBeenCalledWith({ token: "t" });
  });

  it("sends today's requests for a Follower", async () => {
    untoasted = [event("e4")];
    render(connected({ ...travelerViewingPrivately, role: "follower" }));
    await waitFor(() => expect(markToasted).toHaveBeenCalledWith({ token: "t", ids: ["e4"] }));
    const readArgs = vi.mocked(convexReact.useQuery).mock.calls
      .filter((c) => c[0] === tripcastApi.scoring.getScoreSummary)
      .map((c) => c[1]);
    expect(readArgs.at(-1)).toEqual({ token: "t" });
  });
});

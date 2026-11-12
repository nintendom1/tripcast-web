import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

import type { CurrentTrip, VisibleRouteVote } from "../../convex/tripcastApi";
import { tripcastApi } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { renderWithTrip, travelerViewingPrivately } from "../../test/renderWithTrip";
import type { TripContextValue } from "../trips/tripTypes";
import RouteVotePanel from "./RouteVotePanel";
import RouteVoteButton from "./RouteVoteButton";
import VoteTimeSplash from "./VoteTimeSplash";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
    span: ({ children, ...props }: HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const currentTrip: CurrentTrip = {
  tripId: "trip-current",
  title: "Current Trip",
  lifecycle: "in_progress",
  isLegacy: false,
  revision: 1,
  publishingEpoch: 1,
  epochStartedAt: 1,
  multiTripEnabled: true,
};
const privateView: Partial<TripContextValue> = { ...travelerViewingPrivately, currentTrip };
const following: Partial<TripContextValue> = {
  role: "traveler",
  multiTripEnabled: true,
  viewingMode: "follow_current",
  viewingTripId: "trip-current",
  viewingTrip: { tripId: "trip-current", title: "Current Trip" },
  currentTrip,
};

const panel = (
  <RouteVotePanel
    open
    role="traveler"
    token="t"
    onClose={vi.fn()}
    onRequestCoordinatePick={vi.fn()}
    referenceLocation={null}
    onVoteOverlayChange={vi.fn()}
    onRequestFitMap={vi.fn()}
    fallbackOrigin={null}
  />
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(convexReact.useQuery).mockReturnValue(undefined as never);
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn() as never);
});

function argsFor(ref: unknown) {
  return vi.mocked(convexReact.useQuery).mock.calls.find(([r]) => r === ref)?.[1];
}

describe("Route votes with a viewed trip", () => {
  it("reads carry the viewed trip in private view and nothing with multi-trip disabled", () => {
    const { unmount } = renderWithTrip(<RouteVoteButton token="t" onClick={vi.fn()} />, { trip: privateView });
    expect(argsFor(tripcastApi.routeVotes.getActiveRouteVoteAlert)).toEqual({ token: "t", tripId: "trip-other" });
    unmount();
    vi.mocked(convexReact.useQuery).mockClear();
    render(<RouteVoteButton token="t" onClick={vi.fn()} />);
    expect(argsFor(tripcastApi.routeVotes.getActiveRouteVoteAlert)).toEqual({ token: "t" });
  });

  it("opening a new vote is unavailable in private view, with a reason", () => {
    renderWithTrip(panel, { trip: privateView });
    expect(screen.getByRole("button", { name: /Propose new route/ })).toBeDisabled();
    expect(screen.getByText("Return to Current Trip to open a vote")).toBeInTheDocument();
  });

  it("opening a new vote is available on the shared current trip and with multi-trip disabled", () => {
    const { unmount } = renderWithTrip(panel, { trip: following });
    expect(screen.getByRole("button", { name: /Propose new route/ })).toBeEnabled();
    unmount();
    render(panel);
    expect(screen.getByRole("button", { name: /Propose new route/ })).toBeEnabled();
  });

  it("a dismissed vote splash is remembered per trip", () => {
    vi.useFakeTimers();
    try {
      const vote: VisibleRouteVote = {
        _id: "vote1",
        title: "Ferry or ramen",
        effectiveStatus: "active",
        expiresAt: Date.now() + 2 * 60 * 60 * 1000,
        resultsVisibility: "before_voting",
        options: [],
        visibleComments: [],
      };
      vi.mocked(convexReact.useQuery).mockImplementation(((ref: unknown, args: unknown) =>
        args !== "skip" && ref === tripcastApi.routeVotes.listVisibleRouteVotes ? [vote] : undefined) as never);
      const other = { ...travelerViewingPrivately, viewingTripId: "trip-b", viewingTrip: { tripId: "trip-b", title: "B" } };
      const ui = <VoteTimeSplash token="t" enabled onOpenVotes={vi.fn()} />;
      const { rerender } = render(<TripContextTestProvider value={travelerViewingPrivately}>{ui}</TripContextTestProvider>);
      fireEvent.click(screen.getByRole("button", { name: /Cast your vote/ }));
      expect(screen.queryByRole("button", { name: /Cast your vote/ })).not.toBeInTheDocument();
      rerender(<TripContextTestProvider value={other}>{ui}</TripContextTestProvider>);
      expect(screen.getByRole("button", { name: /Cast your vote/ })).toBeInTheDocument();
      act(() => {
        rerender(<TripContextTestProvider value={travelerViewingPrivately}>{ui}</TripContextTestProvider>);
      });
      expect(screen.queryByRole("button", { name: /Cast your vote/ })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

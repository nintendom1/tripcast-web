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

  it("a dismissed vote splash keeps today's key with multi-trip disabled and for the Legacy Trip", () => {
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
      const ui = <VoteTimeSplash token="t" enabled onOpenVotes={vi.fn()} />;
      const legacy: Partial<TripContextValue> = {
        ...following,
        currentTrip: { ...currentTrip, isLegacy: true },
      };
      // Dismissed while multi-trip is disabled (no viewed trip) ...
      const { rerender } = render(<TripContextTestProvider value={{}}>{ui}</TripContextTestProvider>);
      fireEvent.click(screen.getByRole("button", { name: /Cast your vote/ }));
      // ... stays dismissed once the deployment is bootstrapped and the Legacy Trip is viewed.
      rerender(<TripContextTestProvider value={legacy}>{ui}</TripContextTestProvider>);
      expect(screen.queryByRole("button", { name: /Cast your vote/ })).not.toBeInTheDocument();
      // A non-Legacy trip has its own key.
      rerender(<TripContextTestProvider value={following}>{ui}</TripContextTestProvider>);
      expect(screen.getByRole("button", { name: /Cast your vote/ })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a Follower's vote list request carries no trip", () => {
    renderWithTrip(
      <RouteVotePanel open role="follower" token="t" onClose={vi.fn()} onVoteOverlayChange={vi.fn()} onRequestFitMap={vi.fn()} fallbackOrigin={null} />,
      { trip: { role: "follower", viewingTripId: "trip-current", viewingTrip: { tripId: "trip-current", title: "Current Trip" } } },
    );
    expect(argsFor(tripcastApi.routeVotes.listVisibleRouteVotes)).toEqual({ token: "t" });
  });

  it("opening a new vote follows the viewed trip when the view returns to the shared trip", () => {
    const { rerender } = render(<TripContextTestProvider value={privateView}>{panel}</TripContextTestProvider>);
    expect(screen.getByRole("button", { name: /Propose new route/ })).toBeDisabled();
    rerender(<TripContextTestProvider value={following}>{panel}</TripContextTestProvider>);
    expect(screen.getByRole("button", { name: /Propose new route/ })).toBeEnabled();
  });
});

describe("Route vote detail map fit", () => {
  const vote = {
    _id: "tv1",
    title: "Traveler Vote",
    status: "active",
    effectiveStatus: "active",
    resultsVisibility: "after_close",
    expiresAt: Date.now() + 3_600_000,
    createdAt: 1,
    updatedAt: 1,
    options: [{ _id: "o1", title: "Cafe", routeVoteId: "tv1", createdAt: 0, updatedAt: 0 }],
    optionVoteCounts: { o1: 0 },
    suggestedWinnerId: null,
    isTied: false,
    totalSubmissions: 0,
    submissions: [],
  };
  const overlay = {
    travelerLocation: { lat: 47.6, lon: -122.3 },
    coordinateOptions: [{ optionId: "o1", title: "Cafe", lat: 47.62, lon: -122.34 }],
  };

  function openDetail(trip: Partial<TripContextValue>) {
    vi.mocked(convexReact.useQuery).mockImplementation(((ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      if (ref === tripcastApi.routeVotes.travelerListRouteVotes) return [vote];
      if (ref === tripcastApi.routeVotes.travelerGetRouteVoteDetail) return vote;
      if (ref === tripcastApi.routeVotes.getRouteVoteMapOverlay) return overlay;
      return undefined;
    }) as never);
    const onRequestFitMap = vi.fn();
    renderWithTrip(
      <RouteVotePanel
        open
        role="traveler"
        token="t"
        onClose={vi.fn()}
        onRequestCoordinatePick={vi.fn()}
        referenceLocation={null}
        onVoteOverlayChange={vi.fn()}
        onRequestFitMap={onRequestFitMap}
        fallbackOrigin={null}
      />,
      { trip },
    );
    fireEvent.click(screen.getByText("Traveler Vote"));
    return onRequestFitMap;
  }

  it("does not fit the map to the Traveler's live position on a privately viewed trip", () => {
    const fit = openDetail(privateView);
    expect(fit).toHaveBeenCalledWith(null);
    expect(fit).not.toHaveBeenCalledWith(expect.arrayContaining([expect.anything()]));
  });

  it("fits the map on the shared current trip", () => {
    const fit = openDetail(following);
    expect(fit).toHaveBeenCalledWith(expect.arrayContaining([expect.anything()]));
  });

  it("fits the map when the privately viewed trip has become the shared current trip", () => {
    const fit = openDetail({ ...privateView, currentTrip: { ...currentTrip, tripId: "trip-other" } });
    expect(fit).toHaveBeenCalledWith(expect.arrayContaining([expect.anything()]));
  });
});

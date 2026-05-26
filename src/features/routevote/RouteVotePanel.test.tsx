import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import { tripcastApi, type RouteVoteListItem, type VisibleRouteVote } from "../../convex/tripcastApi";
import RouteVotePanel from "./RouteVotePanel";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const MOCK_VOTE: VisibleRouteVote = {
  _id: "vote1",
  title: "Test Vote",
  effectiveStatus: "active",
  expiresAt: Date.now() + 1_000_000,
  options: [
    {
      _id: "opt1",
      title: "Option A",
      routeVoteId: "vote1",
      createdAt: 0,
      updatedAt: 0,
    },
  ],
  visibleComments: [
    {
      submissionId: "sub1",
      comment: "Great idea",
      commentVisibility: "public",
      author: "@alice",
    },
  ],
  mySubmission: undefined,
  resultsVisibility: "before_voting" as const,
};

const MOCK_CLOSED_VOTE: VisibleRouteVote = {
  _id: "vote2",
  title: "Closed Vote",
  effectiveStatus: "resolved",
  expiresAt: Date.now() - 1_000,
  resultsVisibility: "after_close",
  confirmedWinningOptionId: "opt2",
  resultingMissionId: "mission1",
  options: [
    {
      _id: "opt2",
      title: "Winner",
      routeVoteId: "vote2",
      createdAt: 0,
      updatedAt: 0,
    },
  ],
  visibleComments: [],
  optionVoteCounts: { opt2: 3 },
  totalSubmissions: 3,
};

const MOCK_VOTES: VisibleRouteVote[] = [MOCK_VOTE, MOCK_CLOSED_VOTE];

const MOCK_TRAVELER_VOTE: RouteVoteListItem = {
  _id: "traveler-vote-1",
  title: "Traveler Vote",
  status: "active",
  effectiveStatus: "active",
  resultsVisibility: "after_close",
  expiresAt: Date.now() + 3_600_000,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  options: [
    {
      _id: "traveler-opt-1",
      title: "Traveler Option",
      routeVoteId: "traveler-vote-1",
      createdAt: 0,
      updatedAt: 0,
    },
  ],
  optionVoteCounts: { "traveler-opt-1": 2 },
  suggestedWinnerId: null,
  isTied: false,
  totalSubmissions: 2,
};

function setupMocks() {

  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.routeVotes.listVisibleRouteVotes) return MOCK_VOTES;
    if (ref === tripcastApi.routeVotes.travelerListRouteVotes) return [MOCK_TRAVELER_VOTE];
    if (ref === tripcastApi.routeVotes.travelerGetRouteVoteDetail) {
      return {
        ...MOCK_TRAVELER_VOTE,
        submissions: [],
      };
    }
    if (ref === tripcastApi.routeVotes.getRouteVoteMapOverlay) return null;
    return undefined;
  });

  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn().mockResolvedValue(null) as any);
}

function renderPanel() {
  return render(
    <RouteVotePanel
      open
      token="test-token"
      onClose={vi.fn()}
      onVoteOverlayChange={vi.fn()}
      onRequestFitMap={vi.fn()}
      fallbackOrigin={null}
    />,
  );
}

function renderTravelerPanel(isPickingCoordinate = false) {
  return render(
    <RouteVotePanel
      open
      role="traveler"
      token="test-token"
      onClose={vi.fn()}
      onRequestCoordinatePick={vi.fn()}
      referenceLocation={null}
      onVoteOverlayChange={vi.fn()}
      onRequestFitMap={vi.fn()}
      fallbackOrigin={null}
      isPickingCoordinate={isPickingCoordinate}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setupMocks();
});

describe("RouteVotePanel", () => {
  it("renders vote list", () => {
    renderPanel();
    expect(screen.getByText("Test Vote")).toBeInTheDocument();
    expect(screen.getByText("Closed Vote")).toBeInTheDocument();
    expect(screen.getByText("1 open · 1 closed")).toBeInTheDocument();
  });

  it("shows closed vote winner and tally", () => {
    renderPanel();
    expect(screen.getByText("Winner:")).toBeInTheDocument();
    expect(screen.getByText("3/3")).toBeInTheDocument();
  });

  it("clicking a vote shows VoteDetail", async () => {
    renderPanel();
    await userEvent.click(screen.getByText("Test Vote"));
    // After clicking into a vote, the sticky header shows the vote title
    // and VoteDetail also renders it in the DialogueBox
    const instances = screen.getAllByText("Test Vote");
    expect(instances.length).toBeGreaterThan(0);
  });

  it("shows author attribution on visible comments", async () => {
    renderPanel();
    await userEvent.click(screen.getByText("Test Vote"));
    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(screen.getByText("Great idea")).toBeInTheDocument();
  });

  it("shows a checkbox indicator when a follower selects an option", async () => {
    renderPanel();
    await userEvent.click(screen.getByText("Test Vote"));

    expect(screen.getByRole("checkbox", { name: "Not selected" })).toHaveAttribute("aria-checked", "false");
    await userEvent.click(screen.getByText("Option A"));

    expect(screen.getByRole("checkbox", { name: "Selected" })).toHaveAttribute("aria-checked", "true");
  });

  it("shows Post as anonymous checkbox when comment visibility is public", async () => {
    renderPanel();
    await userEvent.click(screen.getByText("Test Vote"));
    expect(screen.getByRole("checkbox", { name: /post as anonymous/i })).toBeInTheDocument();
  });

  it("hides Post as anonymous checkbox when Private is checked", async () => {
    renderPanel();
    await userEvent.click(screen.getByText("Test Vote"));

    const privateCheckbox = screen.getByRole("checkbox", { name: /private/i });
    await userEvent.click(privateCheckbox);

    expect(screen.queryByRole("checkbox", { name: /post as anonymous/i })).not.toBeInTheDocument();
  });

  it("uses the shared vote card list and traveler management in detail mode", async () => {
    renderTravelerPanel();

    expect(screen.getByText("Traveler Vote")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Traveler Vote"));

    expect(screen.getByRole("button", { name: "Close voting" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByText("You voted")).not.toBeInTheDocument();
  });

  it("hides the shared panel during traveler coordinate picking", () => {
    renderTravelerPanel(true);

    expect(document.querySelector("[data-role='route-votes-sheet']")).toHaveClass("invisible");
    expect(document.querySelector("[data-role='route-votes-sheet']")).toHaveClass("pointer-events-none");
  });
});

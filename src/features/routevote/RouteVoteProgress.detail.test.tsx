import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import { tripcastApi, type RouteVoteListItem } from "../../convex/tripcastApi";
import RouteVoteProgress from "./RouteVoteProgress";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

// framer-motion's AnimatePresence / motion adds async animation state;
// mock it to synchronous pass-throughs so RTL doesn't need act() wrappers.
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...rest}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockVote: RouteVoteListItem = {
  _id: "vote-id-1",
  title: "Test Vote",
  status: "active",
  effectiveStatus: "active",
  resultsVisibility: "after_close",
  expiresAt: Date.now() + 3_600_000,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  options: [],
  optionVoteCounts: {},
  suggestedWinnerId: null,
  isTied: false,
  totalSubmissions: 0,
};

function setupMocks({ detailResult }: { detailResult: unknown }) {
   
  (vi.mocked(convexReact.useQuery) as any).mockImplementation(
    (ref: unknown) => {
      if (ref === tripcastApi.routeVotes.travelerGetRouteVoteDetail) {
        return detailResult;
      }
      if (ref === tripcastApi.routeVotes.getRouteVoteMapOverlay) return null;
      return [mockVote];
    },
  );
   
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn().mockResolvedValue(null) as any);
}

function renderProgress() {
  return render(
    <RouteVoteProgress
      token="test-token"
      onClose={vi.fn()}
      onRequestCoordinatePick={vi.fn()}
      referenceLocation={null}
      onVoteOverlayChange={vi.fn()}
      onRequestFitMap={vi.fn()}
      fallbackOrigin={null}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RouteVoteProgress: VoteDetailView null state", () => {
  it("shows the deleted-vote recovery state when detail query returns null", async () => {
    setupMocks({ detailResult: null });

    renderProgress();

    // The list renders the mock vote with a "Details" button.
    await userEvent.click(screen.getByRole("button", { name: "Details" }));

    await waitFor(() => {
      expect(screen.getByText("This route vote was deleted.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Back to votes" })).toBeInTheDocument();
  });

  it("navigates back to the vote list when Back to votes is clicked", async () => {
    setupMocks({ detailResult: null });

    renderProgress();

    await userEvent.click(screen.getByRole("button", { name: "Details" }));
    await waitFor(() => screen.getByRole("button", { name: "Back to votes" }));

    await userEvent.click(screen.getByRole("button", { name: "Back to votes" }));

    // After going back, the vote title should be visible in the list again.
    await waitFor(() => {
      expect(screen.getByText("Test Vote")).toBeInTheDocument();
    });
  });
});

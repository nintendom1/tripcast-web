import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import { tripcastApi, type RouteVoteListItem } from "../../convex/tripcastApi";
import RouteVoteProgress from "./RouteVoteProgress";
import { Sheet } from "../../components/ui/sheet";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

// Mock the Sheet primitives to capture callbacks and provide stable test targets
vi.mock("../../components/ui/sheet", () => ({
  Sheet: vi.fn(({ children }) => <div data-testid="mock-sheet">{children}</div>),
  SheetContent: vi.fn(({ children, className, "data-role": role }) => (
    <div role="dialog" className={className} data-role={role}>
      {children}
    </div>
  )),
  SheetTitle: vi.fn(({ children, className }) => <h2 className={className}>{children}</h2>),
  SheetCloseButton: () => <button>Close</button>,
  SheetBackButton: () => <button>Back</button>,
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

function setupMocks() {
  (vi.mocked(convexReact.useQuery) as any).mockImplementation(
    (ref: unknown) => {
      if (ref === tripcastApi.routeVotes.travelerGetRouteVoteDetail) {
        return undefined; // Loading state
      }
      if (ref === tripcastApi.routeVotes.getRouteVoteMapOverlay) {
        return null;
      }
      return [mockVote];
    },
  );

  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn().mockResolvedValue(null) as any);
}

function renderProgress(isPickingCoordinate?: boolean, onClose = vi.fn()) {
  return render(
    <RouteVoteProgress
      open
      token="test-token"
      onClose={onClose}
      onRequestCoordinatePick={vi.fn()}
      referenceLocation={null}
      onVoteOverlayChange={vi.fn()}
      onRequestFitMap={vi.fn()}
      fallbackOrigin={null}
      isPickingCoordinate={isPickingCoordinate}
    />,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  setupMocks();
});

describe("RouteVoteProgress: Visibility during coordinate pick", () => {
  it("renders sheet content normally when isPickingCoordinate is false", () => {
    renderProgress(false);
    const sheetContent = screen.getByRole("dialog");

    expect(sheetContent).toBeInTheDocument();
    expect(sheetContent).not.toHaveClass("invisible");
    expect(sheetContent).not.toHaveClass("pointer-events-none");
  });

  it("renders sheet content normally when isPickingCoordinate is undefined", () => {
    renderProgress(undefined);
    const sheetContent = screen.getByRole("dialog");

    expect(sheetContent).toBeInTheDocument();
    expect(sheetContent).not.toHaveClass("invisible");
    expect(sheetContent).not.toHaveClass("pointer-events-none");
  });

  it("hides sheet content with invisible and pointer-events-none when isPickingCoordinate is true", () => {
    renderProgress(true);
    const sheetContent = screen.getByRole("dialog");

    expect(sheetContent).toBeInTheDocument();
    expect(sheetContent).toHaveClass("invisible");
    expect(sheetContent).toHaveClass("pointer-events-none");
  });

  it("passes disablePointerDismissal to Sheet based on picking state", () => {
    renderProgress(true);
    const lastCallProps = vi.mocked(Sheet).mock.calls[0][0] as any;
    expect(lastCallProps.disablePointerDismissal).toBe(true);
  });

  it("guards onClose during map interaction", () => {
    const onClose = vi.fn();
    renderProgress(true, onClose);

    const mockSheet = vi.mocked(Sheet);
    const onOpenChange = (mockSheet.mock.calls[mockSheet.mock.calls.length - 1][0] as any).onOpenChange;

    onOpenChange?.(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("allows onClose when not picking", () => {
    const onClose = vi.fn();
    renderProgress(false, onClose);

    const mockSheet = vi.mocked(Sheet);
    const onOpenChange = (mockSheet.mock.calls[mockSheet.mock.calls.length - 1][0] as any).onOpenChange;

    onOpenChange?.(false);
    expect(onClose).toHaveBeenCalled();
  });

  it("allows map interaction when coordinate picking is active", () => {
    renderProgress(true);

    // Sheet should not be interactive
    const sheetContent = screen.getByRole("dialog");
    expect(sheetContent).toHaveClass("pointer-events-none");
  });

  it("sheet remains interactive after coordinate picking ends", () => {
    const { rerender: localRerender } = renderProgress(true);

    // Verify it's hidden
    let sheetContent = screen.getByRole("dialog");
    expect(sheetContent).toHaveClass("invisible");

    // Re-render with isPickingCoordinate=false
    localRerender(
      <RouteVoteProgress
        open
        token="test-token"
        onClose={vi.fn()}
        onRequestCoordinatePick={vi.fn()}
        referenceLocation={null}
        onVoteOverlayChange={vi.fn()}
        onRequestFitMap={vi.fn()}
        fallbackOrigin={null}
        isPickingCoordinate={false}
      />,
    );

    // Verify it's visible again
    sheetContent = screen.getByRole("dialog");
    expect(sheetContent).not.toHaveClass("invisible");
    expect(sheetContent).not.toHaveClass("pointer-events-none");
  });

  it("title remains visible in the document even when sheet is hidden", () => {
    renderProgress(true);

    // The title text should still be in the DOM (even if invisible)
    expect(screen.getByText("Votes")).toBeInTheDocument();
  });
});

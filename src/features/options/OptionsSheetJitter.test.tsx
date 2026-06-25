import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { ThemeProvider } from "../../providers/ThemeProvider";
import OptionsSheet from "./OptionsSheet";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("maplibre-gl", () => ({
  default: {
    Map: class {
      on = vi.fn();
      remove = vi.fn();
    },
    LngLatBounds: class {
      extend = vi.fn();
      toArray = vi.fn();
    },
  },
}));

vi.mock("../../components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => (
    open ? <div data-testid="sheet">{children}</div> : null
  ),
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetBody: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  SheetCloseButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>Close</button>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetBackButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>Back</button>
  ),
}));

describe("OptionsSheet Breadcrumb Jitter Detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displays distance and time difference between breadcrumbs in individual mode", async () => {
    const samples = [
      { _id: "s1", lat: 45, lon: -122, sampledAt: 1000 * 60 * 10 },
      { _id: "s2", lat: 45.001, lon: -122, sampledAt: 1000 * 60 * 11 }, // ~111m away, 1m later
      { _id: "s3", lat: 45.005, lon: -122, sampledAt: 1000 * 60 * 11 + 3000 }, // ~444m away in 3s -> ~148 m/s (isJumpy)
    ];

    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: any) => {
      if (ref === tripcastApi.liveTrail.travelerPreviewLiveTrailDeleteRange) {
        return { count: 3, samples };
      }
      if (ref === tripcastApi.liveTrail.travelerGetLiveTrailStatus) {
        return { enabled: true, visibleToFollowers: true };
      }
      return {};
    });

    vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn().mockResolvedValue({}) as any);

    render(
      <ThemeProvider>
        <OptionsSheet
          open
          onOpenChange={vi.fn()}
          session={{ token: "t", role: "traveler", sessionType: "legacy", displayName: "T" }}
          role="traveler"
          onSignOut={vi.fn()}
          onManageFollowers={vi.fn()}
          onReplayFollowerTour={vi.fn()}
          onLoggedOut={vi.fn()}
          onLocationDataCleared={vi.fn()}
          onTripDataDeleted={vi.fn()}
          onResetStarted={vi.fn()}
          defaultView="live-trail"
        />
      </ThemeProvider>
    );

    await userEvent.selectOptions(screen.getByLabelText(/Delete mode/i), "individual");

    const listContainer = screen.getByText(/#1/).closest<HTMLElement>(".overflow-auto")!;
    const items = within(listContainer).getAllByRole("checkbox");

    // Sample #1: No distance/time (first one)
    const item1 = items[0].closest<HTMLElement>("label")!;
    expect(within(item1).queryByText(/^\d+m$/)).not.toBeInTheDocument();

    // Sample #2: ~111m, 1m
    const item2 = items[1].closest<HTMLElement>("label")!;
    expect(within(item2).getByText(/^111m$/)).toBeInTheDocument();
    expect(within(item2).getByText(/\/ 1m/)).toBeInTheDocument();
    expect(item2.className).not.toContain("bg-[var(--bg-danger)]");

    // Sample #3: ~445m in 3s -> implausible speed -> Jumpy!
    const item3 = items[2].closest<HTMLElement>("label")!;
    expect(within(item3).getByText(/^445m$/)).toBeInTheDocument();
    expect(within(item3).getByText(/\/ 3s/)).toBeInTheDocument();
    expect(item3.className).toContain("bg-[var(--bg-danger)]");
  });
});

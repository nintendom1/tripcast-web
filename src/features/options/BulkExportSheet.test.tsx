import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQuery } from "convex/react";
import BulkExportSheet from "./BulkExportSheet";

// Mock Convex
vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

// The sheet calls useQuery up to three times. Discriminate by args shape so
// test ordering is robust to re-renders:
//  - travelerExportTripData       → args has "includeLiveTrail"
//  - travelerCountExportEntries   → args has "includeMysteryMissions" but no "includeLiveTrail"
//  - travelerExportTickerMessages → args has only "token"
function mockQueries(
  tripData: unknown,
  tickerData: unknown,
  countData: unknown = { otherCount: 1, breadcrumbCount: 5 },
) {
  (useQuery as any).mockImplementation((_ref: unknown, args: any) => {
    if (!args || args === "skip") return undefined;
    if ("includeLiveTrail" in args) return tripData;
    if ("includeMysteryMissions" in args) return countData;
    return tickerData;
  });
}

// Mock Music Provider
vi.mock("../../providers/MusicProvider", () => ({
  useMusicSafe: () => ({
    sfx: vi.fn(),
  }),
}));

// Mock Debug
vi.mock("../../debug/useActiveUiContext", () => ({
  useActiveUiContext: vi.fn(),
}));
vi.mock("../../debug/useDebugLogger", () => ({
  useDebugLogger: () => ({
    logUi: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("BulkExportSheet", () => {
  const token = "test-token";
  const mockData = {
    timeZone: "UTC",
    entries: [
      { kind: "checkin", ref: "c1", occurredAt: "2026-05-14T10:00:00Z", title: "Pin" },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mocking browser APIs
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:url"),
      revokeObjectURL: vi.fn(),
    });
  });

  const tickerData = {
    entries: [
      { kind: "ticker_fact", ref: "ticker_fact:abc", text: "Did you know?" },
      { kind: "ticker_tip", ref: "ticker_tip:def", text: "Pack a battery." },
    ],
  };

  it("renders loading state when data is fetching", () => {
    (useQuery as any).mockReturnValue(undefined);
    render(<BulkExportSheet open={true} token={token} onOpenChange={() => {}} />);

    expect(screen.getByText(/Preparing export.../i)).toBeInTheDocument();
  });

  it("displays items count and action buttons when data is ready", () => {
    mockQueries(mockData, tickerData);
    render(<BulkExportSheet open={true} token={token} onOpenChange={() => {}} />);

    expect(screen.getByText(/1 items ready for export/i)).toBeInTheDocument();
    // Two cards (trip data + ticker) → two of each button.
    expect(screen.getAllByRole("button", { name: /Copy JSON/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /Download .json/i })).toHaveLength(2);
  });

  it("allows switching to custom date range", async () => {
    mockQueries(mockData, tickerData);
    render(<BulkExportSheet open={true} token={token} onOpenChange={() => {}} />);

    const customButton = screen.getByText(/Custom Range/i);
    await userEvent.click(customButton);

    expect(screen.getByText(/Start Date/i)).toBeInTheDocument();
    expect(screen.getByText(/End Date/i)).toBeInTheDocument();
  });

  it("requests Live Trail breadcrumbs only when the option is enabled", async () => {
    mockQueries(mockData, tickerData);
    render(<BulkExportSheet open={true} token={token} onOpenChange={() => {}} />);

    expect((useQuery as any).mock.calls).toContainEqual([
      expect.anything(),
      expect.objectContaining({ includeLiveTrail: false }),
    ]);

    await userEvent.click(screen.getByLabelText(/Include Live Trail breadcrumbs/i));

    expect((useQuery as any).mock.calls).toContainEqual([
      expect.anything(),
      expect.objectContaining({ includeLiveTrail: true }),
    ]);
  });

  it("calls clipboard API when the trip-data Copy JSON is clicked", async () => {
    mockQueries(mockData, tickerData);
    render(<BulkExportSheet open={true} token={token} onOpenChange={() => {}} />);

    const [tripCopyButton] = screen.getAllByRole("button", { name: /Copy JSON/i });
    await userEvent.click(tripCopyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify(mockData, null, 2)
    );
  });

  it("triggers file download when the trip-data Download .json is clicked", async () => {
    mockQueries(mockData, tickerData);

    render(<BulkExportSheet open={true} token={token} onOpenChange={() => {}} />);

    const link = document.createElement("a");
    const click = vi.spyOn(link, "click").mockImplementation(() => {});
    const originalCreateElement = document.createElement.bind(document);
    const createElement = vi.spyOn(document, "createElement").mockImplementation((tagName, options) => {
      if (tagName.toLowerCase() === "a") return link;
      return originalCreateElement(tagName, options);
    });

    const [tripDownloadButton] = screen.getAllByRole("button", { name: /Download .json/i });
    await userEvent.click(tripDownloadButton);

    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(link.download).toContain("tripcast-export-");
    expect(click).toHaveBeenCalled();
    createElement.mockRestore();
  });

  it("renders the ticker card with item count and an enabled download", async () => {
    mockQueries(mockData, tickerData);
    render(<BulkExportSheet open={true} token={token} onOpenChange={() => {}} />);

    expect(screen.getByText(/2 ticker items ready for export/i)).toBeInTheDocument();
    const downloadButtons = screen.getAllByRole("button", { name: /Download .json/i });
    expect(downloadButtons[1]).not.toBeDisabled();
  });

  it("disables ticker actions when no ticker items exist", () => {
    mockQueries(mockData, { entries: [] });
    render(<BulkExportSheet open={true} token={token} onOpenChange={() => {}} />);

    expect(screen.getByText(/0 ticker items ready for export/i)).toBeInTheDocument();
    const copyButtons = screen.getAllByRole("button", { name: /Copy JSON/i });
    const downloadButtons = screen.getAllByRole("button", { name: /Download .json/i });
    expect(copyButtons[1]).toBeDisabled();
    expect(downloadButtons[1]).toBeDisabled();
  });

  it("shows a checking state while the breadcrumb count is loading", async () => {
    // Count query still resolving (undefined) while the others have data.
    (useQuery as any).mockImplementation((_ref: unknown, args: any) => {
      if (!args || args === "skip") return undefined;
      if ("includeLiveTrail" in args) return mockData;
      if ("includeMysteryMissions" in args) return undefined; // count not ready
      return tickerData;
    });
    render(<BulkExportSheet open={true} token={token} onOpenChange={() => {}} />);

    await userEvent.click(screen.getByLabelText(/Include Live Trail breadcrumbs/i));

    expect(screen.getByText(/Checking breadcrumb count.../i)).toBeInTheDocument();
  });

  it("blocks the one-shot export and offers recent-N when over the cap", async () => {
    mockQueries(mockData, tickerData, { otherCount: 10, breadcrumbCount: 9000 });
    render(<BulkExportSheet open={true} token={token} onOpenChange={() => {}} />);

    await userEvent.click(screen.getByLabelText(/Include Live Trail breadcrumbs/i));

    expect(screen.getByText(/9,000 breadcrumbs recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/over the 8,000-entry safe limit/i)).toBeInTheDocument();
    // recentN = SAFE_CAP - otherCount = 8000 - 10 = 7990.
    expect(
      screen.getByRole("button", { name: /Export most recent 7,990/i }),
    ).toBeInTheDocument();
    // The trip-data export query is gated off while blocked.
    expect((useQuery as any).mock.calls).not.toContainEqual([
      expect.anything(),
      expect.objectContaining({ liveTrailLimit: expect.anything() }),
    ]);
    // The trip-data Copy/Download buttons are not rendered (only the ticker pair remains).
    expect(screen.getAllByRole("button", { name: /Copy JSON/i })).toHaveLength(1);
  });

  it("runs a bounded export with liveTrailLimit after confirming recent-N", async () => {
    mockQueries(mockData, tickerData, { otherCount: 10, breadcrumbCount: 9000 });
    render(<BulkExportSheet open={true} token={token} onOpenChange={() => {}} />);

    await userEvent.click(screen.getByLabelText(/Include Live Trail breadcrumbs/i));
    await userEvent.click(screen.getByRole("button", { name: /Export most recent 7,990/i }));

    // Export now requested with the bounded breadcrumb limit.
    expect((useQuery as any).mock.calls).toContainEqual([
      expect.anything(),
      expect.objectContaining({ includeLiveTrail: true, liveTrailLimit: 7990 }),
    ]);
    expect(screen.getByText(/1 items ready for export/i)).toBeInTheDocument();
    expect(screen.getByText(/Most recent 7,990 of 9,000 breadcrumbs/i)).toBeInTheDocument();
  });

  it("tells the user to narrow the range when other data already fills the cap", async () => {
    // otherCount alone exceeds the cap → recentN clamps to 0, no recent-N button.
    mockQueries(mockData, tickerData, { otherCount: 8500, breadcrumbCount: 100 });
    render(<BulkExportSheet open={true} token={token} onOpenChange={() => {}} />);

    await userEvent.click(screen.getByLabelText(/Include Live Trail breadcrumbs/i));

    expect(screen.getByText(/Narrow the date range to make room/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Export most recent/i })).toBeNull();
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQuery } from "convex/react";
import BulkExportSheet from "./BulkExportSheet";

// Mock Convex
vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

// The sheet calls useQuery twice: travelerExportTripData (args include
// includeMysteryMissions) and travelerExportTickerMessages (args has only token).
// Discriminate by args shape so test ordering is robust to re-renders.
function mockQueries(tripData: unknown, tickerData: unknown) {
  (useQuery as any).mockImplementation((_ref: unknown, args: any) => {
    if (!args || args === "skip") return undefined;
    if ("includeMysteryMissions" in args) return tripData;
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
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQuery } from "convex/react";
import BulkExportSheet from "./BulkExportSheet";

// Mock Convex
vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

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

  it("renders loading state when data is fetching", () => {
    (useQuery as any).mockReturnValue(undefined);
    render(<BulkExportSheet open={true} token={token} onOpenChange={() => {}} />);

    expect(screen.getByText(/Preparing export.../i)).toBeInTheDocument();
  });

  it("displays items count and action buttons when data is ready", () => {
    (useQuery as any).mockReturnValue(mockData);
    render(<BulkExportSheet open={true} token={token} onOpenChange={() => {}} />);

    expect(screen.getByText(/1 items ready for export/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy JSON/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download .json/i })).toBeInTheDocument();
  });

  it("allows switching to custom date range", async () => {
    (useQuery as any).mockReturnValue(mockData);
    render(<BulkExportSheet open={true} token={token} onOpenChange={() => {}} />);

    const customButton = screen.getByText(/Custom Range/i);
    await userEvent.click(customButton);

    expect(screen.getByText(/Start Date/i)).toBeInTheDocument();
    expect(screen.getByText(/End Date/i)).toBeInTheDocument();
  });

  it("calls clipboard API when Copy JSON is clicked", async () => {
    (useQuery as any).mockReturnValue(mockData);
    render(<BulkExportSheet open={true} token={token} onOpenChange={() => {}} />);

    const copyButton = screen.getByRole("button", { name: /Copy JSON/i });
    await userEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify(mockData, null, 2)
    );
    expect(screen.getByText(/Copied/i)).toBeInTheDocument();
  });

  it("triggers file download when Download .json is clicked", async () => {
    (useQuery as any).mockReturnValue(mockData);
    
    render(<BulkExportSheet open={true} token={token} onOpenChange={() => {}} />);

    const link = document.createElement("a");
    const click = vi.spyOn(link, "click").mockImplementation(() => {});
    const originalCreateElement = document.createElement.bind(document);
    const createElement = vi.spyOn(document, "createElement").mockImplementation((tagName, options) => {
      if (tagName.toLowerCase() === "a") return link;
      return originalCreateElement(tagName, options);
    });

    const downloadButton = screen.getByRole("button", { name: /Download .json/i });
    await userEvent.click(downloadButton);

    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(link.download).toContain("tripcast-export-");
    expect(click).toHaveBeenCalled();
    createElement.mockRestore();
  });
});

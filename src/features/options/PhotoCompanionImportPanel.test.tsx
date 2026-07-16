import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as convexReact from "convex/react";

import PhotoCompanionImportPanel from "./PhotoCompanionImportPanel";
import { tripcastApi } from "../../convex/tripcastApi";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useConvex: vi.fn(),
}));

vi.mock("../../providers/MusicProvider", () => ({
  useMusicSafe: () => ({
    sfx: vi.fn(),
  }),
}));

vi.mock("../../providers/BackgroundSaveProvider", () => ({
  useBackgroundSave: () => ({
    saves: [],
  }),
}));

vi.mock("../../debug/useDebugLogger", () => ({
  useDebugLogger: vi.fn(() => ({
    logUi: vi.fn(),
    error: vi.fn(),
  })),
}));

describe("PhotoCompanionImportPanel", () => {
  const mockResolveRefs = vi.fn();
  const mockGenerateUrls = vi.fn();
  const mockAttachBatch = vi.fn();
  const mockPruneOrphans = vi.fn();
  const mockConvex = {
    query: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(convexReact.useConvex).mockReturnValue(mockConvex as any);
    vi.mocked(convexReact.useMutation).mockImplementation(((func: any) => {
      if (func === tripcastApi.photoCompanion.travelerResolvePhotoCompanionRefs) {
        return mockResolveRefs;
      }
      if (func === tripcastApi.photoCompanion.travelerGeneratePhotoImportUploadUrls) {
        return mockGenerateUrls;
      }
      if (func === tripcastApi.photoCompanion.travelerAttachPhotoCompanionBatch) {
        return mockAttachBatch;
      }
      if (func === tripcastApi.photoCompanion.travelerPruneOrphanPhotos) {
        return mockPruneOrphans;
      }
      return vi.fn().mockResolvedValue(null);
    }) as any);

    vi.mocked(convexReact.useQuery).mockImplementation(((func: any) => {
      if (func === tripcastApi.photoCompanion.travelerAuditOrphanPhotoPage) {
        return {
          page: [
            { imageId: "img-orphan-1", bytes: 100000, contentType: "image/jpeg" },
          ],
          continueCursor: "",
          isDone: true,
        };
      }
      return undefined;
    }) as any);
  });

  it("renders the file upload dropzone in idle state", () => {
    render(<PhotoCompanionImportPanel token="test-token" />);
    expect(screen.getByText(/select or drag photo zip/i)).toBeInTheDocument();
    expect(screen.getByText(/orphaned photos cleanup/i)).toBeInTheDocument();
  });

  it("renders scanned orphan summary and allows pruning with confirmation", async () => {
    const user = userEvent.setup();
    mockPruneOrphans.mockResolvedValue([{ imageId: "img-orphan-1", status: "deleted" }]);

    render(<PhotoCompanionImportPanel token="test-token" />);

    // Click scan
    const scanBtn = screen.getByRole("button", { name: /scan orphaned photos/i });
    await user.click(scanBtn);

    // Verify scan results appear
    expect(screen.getByText(/orphans found/i)).toBeInTheDocument();
    expect(screen.getByText(/1 \(0.10 MB\)/i)).toBeInTheDocument();

    // Verify prune button is visible
    const pruneBtn = screen.getByRole("button", { name: /prune storage/i });
    expect(pruneBtn).toBeInTheDocument();

    // Click prune storage to open ConfirmModal
    await user.click(pruneBtn);

    expect(screen.getByText(/prune unreferenced photos\?/i)).toBeInTheDocument();
    expect(screen.getByText(/are you sure you want to permanently delete/i)).toBeInTheDocument();

    // Click confirm deletion
    const confirmBtn = screen.getByRole("button", { name: /delete permanently/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockPruneOrphans).toHaveBeenCalledWith({
        token: "test-token",
        imageIds: ["img-orphan-1"],
      });
    });
  });
});

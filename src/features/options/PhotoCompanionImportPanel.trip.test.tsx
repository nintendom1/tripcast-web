import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import PhotoCompanionImportPanel from "./PhotoCompanionImportPanel";
import { inspectArchiveZip, validateArchiveZip, type PhotoCompanionArchivePhoto } from "./photoCompanionArchive";

const server = vi.hoisted(() => ({
  prunes: [] as Array<Record<string, unknown>>,
  audits: [] as unknown[],
  resolves: [] as Array<Record<string, unknown>>,
  attaches: [] as Array<Record<string, unknown>>,
  generates: [] as Array<Record<string, unknown>>,
  onUpload: (() => undefined) as () => void,
  onFirstPrune: (() => undefined) as () => void,
}));

const convexClient = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  action: vi.fn(),
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const orphans = Array.from({ length: 120 }, (_, i) => ({ imageId: `img-${i}`, bytes: 10, contentType: "image/jpeg" }));
  return {
    useQuery: (ref: never, args: unknown) => {
      if (args === "skip") return undefined;
      if (getFunctionName(ref) === "photoCompanion:travelerAuditOrphanPhotoPage") {
        server.audits.push(args);
        return { page: orphans, continueCursor: "", isDone: true };
      }
      return undefined;
    },
    useMutation: (ref: never) => (args: Record<string, unknown>) => {
      if (getFunctionName(ref) === "photoCompanion:travelerPruneOrphanPhotos") {
        server.prunes.push(args);
        if (server.prunes.length === 1) server.onFirstPrune();
        return Promise.resolve((args.imageIds as string[]).map((imageId) => ({ imageId, status: "deleted" })));
      }
      if (getFunctionName(ref) === "photoCompanion:travelerAttachPhotoCompanionBatch") {
        server.attaches.push(args);
        return Promise.resolve([{ pinRef: "checkin:abc", imageId: "store-1", status: "attached" }]);
      }
      if (getFunctionName(ref) === "photoCompanion:travelerGeneratePhotoImportUploadUrls") {
        server.generates.push(args);
        return Promise.resolve(["https://upload.example/1"]);
      }
      return Promise.resolve(null);
    },
    useConvex: () => convexClient,
  };
});
vi.mock("./photoCompanionArchive", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./photoCompanionArchive")>()),
  inspectArchiveZip: vi.fn(),
  validateArchiveZip: vi.fn(),
}));
vi.mock("../../providers/MusicProvider", () => ({ useMusicSafe: () => ({ sfx: vi.fn() }) }));
vi.mock("../../providers/BackgroundSaveProvider", () => ({ useBackgroundSave: () => ({ saves: [] }) }));
vi.mock("../../debug/useDebugLogger", () => ({ useDebugLogger: () => ({ logUi: vi.fn(), error: vi.fn() }) }));

const following = { ...travelerFollowingCurrent };
const privately = { ...travelerViewingPrivately };

beforeEach(() => {
  server.resolves = [];
  server.attaches = [];
  server.generates = [];
  server.onUpload = () => undefined;
  convexClient.query.mockImplementation(async (_ref: unknown, args: Record<string, unknown>) => {
    server.resolves.push(args);
    return [{ pinRef: "checkin:abc", status: "ready" }];
  });
  server.prunes = [];
  server.audits = [];
  server.onFirstPrune = () => undefined;
});

async function scanAndPrune(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /scan orphaned photos/i }));
  await user.click(await screen.findByRole("button", { name: /prune storage/i }));
  await user.click(screen.getByRole("button", { name: /delete permanently/i }));
}

describe("PhotoCompanionImportPanel with a viewed trip", () => {
  it("every chunk carries the trip the import sheet named, even when the view changes while it runs", async () => {
    const user = userEvent.setup();
    const panel = (
      <PhotoCompanionImportPanel token="tok" tripTarget={{ tripId: "trip-other", title: "Other Trip" }} />
    );
    const view = render(<TripContextTestProvider value={privately}>{panel}</TripContextTestProvider>);
    // Return to current after the first chunk went out.
    server.onFirstPrune = () => view.rerender(<TripContextTestProvider value={following}>{panel}</TripContextTestProvider>);
    await scanAndPrune(user);
    await waitFor(() => expect(server.prunes.length).toBeGreaterThanOrEqual(3));
    expect(server.prunes.slice(0, 3).map((call) => (call.imageIds as string[]).length)).toEqual([50, 50, 20]);
    expect(server.prunes.slice(0, 3).every((call) => call.tripId === "trip-other")).toBe(true);
    expect(server.audits[0]).toMatchObject({ tripId: "trip-other" });
  });

  it("the prune confirmation names the trip, and keeps today's text with multi-trip disabled", async () => {
    const user = userEvent.setup();
    const view = render(
      <TripContextTestProvider value={privately}>
        <PhotoCompanionImportPanel token="tok" tripTarget={{ tripId: "trip-other", title: "Other Trip" }} />
      </TripContextTestProvider>,
    );
    await user.click(screen.getByRole("button", { name: /scan orphaned photos/i }));
    await user.click(await screen.findByRole("button", { name: /prune storage/i }));
    expect(document.body.textContent).toContain("120 unreferenced photos from Other Trip?");
    view.unmount();
    render(<PhotoCompanionImportPanel token="tok" />);
    await user.click(screen.getByRole("button", { name: /scan orphaned photos/i }));
    await user.click(await screen.findByRole("button", { name: /prune storage/i }));
    expect(document.body.textContent).toContain("120 unreferenced photos?");
  });

  it("without a sheet-supplied trip, chunks use the trip captured when the panel mounted", async () => {
    const user = userEvent.setup();
    const panel = <PhotoCompanionImportPanel token="tok" />;
    const view = render(<TripContextTestProvider value={privately}>{panel}</TripContextTestProvider>);
    server.onFirstPrune = () => view.rerender(<TripContextTestProvider value={following}>{panel}</TripContextTestProvider>);
    await scanAndPrune(user);
    await waitFor(() => expect(server.prunes.length).toBeGreaterThanOrEqual(3));
    expect(server.prunes.slice(0, 3).every((call) => call.tripId === "trip-other")).toBe(true);
  });

  it("multi-trip disabled: chunks carry no tripId", async () => {
    const user = userEvent.setup();
    render(<PhotoCompanionImportPanel token="tok" />);
    await scanAndPrune(user);
    await waitFor(() => expect(server.prunes.length).toBeGreaterThanOrEqual(3));
    for (const call of server.prunes) expect(call).not.toHaveProperty("tripId");
    expect(server.audits[0]).toEqual({ token: "tok", paginationOpts: { numItems: 50, cursor: null } });
  });
});

describe("PhotoCompanionImportPanel ZIP import with a viewed trip", () => {
  const photo: PhotoCompanionArchivePhoto = {
    pinRef: "checkin:abc",
    path: "photos/abc.jpg",
    contentType: "image/jpeg",
    bytes: 300_000,
    sha256: "x".repeat(43) + "=",
  };

  async function importZip(user: ReturnType<typeof userEvent.setup>) {
    const manifest = { format: "tripcast-photo-companion" as const, version: 1 as const, exportedAt: "2026-11-18T00:00:00Z", selection: { startMs: null, endMs: null }, photos: [photo], missing: [] };
    vi.mocked(inspectArchiveZip).mockResolvedValue({ manifest, totalPhotoBytes: photo.bytes });
    vi.mocked(validateArchiveZip).mockResolvedValue({
      manifest,
      totalPhotoBytes: photo.bytes,
      photoBlobs: new Map([[photo.pinRef, { blob: new Blob([new Uint8Array(photo.bytes)], { type: "image/jpeg" }), entry: photo }]]),
      photoErrors: new Map(),
    });
    vi.stubGlobal("fetch", vi.fn(async () => {
      server.onUpload();
      return { ok: true, json: () => Promise.resolve({ storageId: "store-1" }) };
    }));
    await user.upload(screen.getByLabelText("Upload Photo Companion ZIP"), new File(["zip"], "photos.zip", { type: "application/zip" }));
    await user.click(await screen.findByRole("button", { name: /start import/i }));
    await waitFor(() => expect(server.attaches).toHaveLength(1));
  }

  it("the resolve pages and the attach chunk all carry the trip the sheet named, though the view changed mid-run", async () => {
    const user = userEvent.setup();
    const panel = <PhotoCompanionImportPanel token="tok" tripTarget={{ tripId: "trip-other", title: "Other Trip" }} />;
    const view = render(<TripContextTestProvider value={privately}>{panel}</TripContextTestProvider>);
    // Return to current while the photos upload, before the attach chunk goes out.
    server.onUpload = () => view.rerender(<TripContextTestProvider value={following}>{panel}</TripContextTestProvider>);
    await importZip(user);
    expect(server.resolves.length).toBeGreaterThan(0);
    expect(server.resolves.every((call) => call.tripId === "trip-other")).toBe(true);
    expect(server.attaches[0]).toMatchObject({ token: "tok", tripId: "trip-other" });
    vi.unstubAllGlobals();
  });

  it("the sheet captured A, the view moved to B, then the panel mounted: resolve and attach still go to A", async () => {
    const user = userEvent.setup();
    // The panel mounts under the OTHER trip's view but is told the sheet's trip.
    render(
      <TripContextTestProvider value={privately}>
        <PhotoCompanionImportPanel token="tok" tripTarget={{ tripId: "trip-current", title: "Current Trip" }} />
      </TripContextTestProvider>,
    );
    await importZip(user);
    expect(server.resolves.every((call) => call.tripId === "trip-current")).toBe(true);
    expect(server.attaches[0]).toMatchObject({ tripId: "trip-current" });
    vi.unstubAllGlobals();
  });

  it("multi-trip disabled: today's resolve and attach requests, no tripId", async () => {
    const user = userEvent.setup();
    render(<PhotoCompanionImportPanel token="tok" />);
    await importZip(user);
    for (const call of [...server.resolves, ...server.attaches]) expect(call).not.toHaveProperty("tripId");
    vi.unstubAllGlobals();
  });
});

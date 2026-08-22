import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import type { PhotoAsset, PhotoLibraryAdapter } from "./photoLibrary";
import { PhotoRouletteSheet } from "./PhotoRouletteSheet";

const assets: PhotoAsset[] = [
  {
    id: "kyoto-evening",
    capturedAt: Date.UTC(2026, 7, 18, 10, 24),
    lat: 35.0116,
    lon: 135.7681,
    pixelWidth: 4032,
    pixelHeight: 3024,
  },
  {
    id: "train-window",
    capturedAt: Date.UTC(2026, 7, 18, 8, 4),
    lat: null,
    lon: null,
    pixelWidth: 3024,
    pixelHeight: 4032,
  },
  {
    id: "icloud-breakfast",
    capturedAt: Date.UTC(2026, 7, 18, 0, 15),
    lat: null,
    lon: null,
    pixelWidth: 4032,
    pixelHeight: 3024,
  },
];

function preview(label: string, from: string, to: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="540" viewBox="0 0 720 540"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="720" height="540" fill="url(#g)"/><circle cx="550" cy="125" r="58" fill="#fff" opacity=".72"/><path d="M0 420 180 245 310 365 440 220 720 440V540H0Z" fill="#172033" opacity=".7"/><text x="36" y="492" fill="white" font-family="sans-serif" font-size="34" font-weight="700">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const thumbnails = {
  "kyoto-evening": preview("Kyoto evening", "#ff9f6e", "#7857a5"),
  "train-window": preview("Train window", "#86c5da", "#e9d8a6"),
};

function createAdapter(
  status: "authorized" | "limited" | "denied" = "authorized",
  library: PhotoAsset[] = assets,
): PhotoLibraryAdapter {
  return {
    getAuthorizationStatus: async () => status,
    requestAuthorization: async () => status,
    manageLimitedAccess: async () => {},
    openSettings: async () => {},
    startSession: async () => ({ sessionId: "storybook-session", total: library.length }),
    getAssets: async (_sessionId, offset, limit = 24) => {
      const pageAssets = library.slice(offset, offset + limit);
      const nextOffset = offset + pageAssets.length;
      return { assets: pageAssets, nextOffset: nextOffset < library.length ? nextOffset : null };
    },
    getAssetIndex: async (_sessionId, assetId) => {
      const index = library.findIndex((asset) => asset.id === assetId);
      return index >= 0 ? index : null;
    },
    getThumbnails: async (assetIds) => assetIds.map((id) => ({
      id,
      data: id === "icloud-breakfast"
        ? null
        : thumbnails[id as keyof typeof thumbnails]
          ?? preview(`Photo ${id.split("-").at(-1)}`, "#86c5da", "#7857a5"),
      isInCloud: id === "icloud-breakfast",
    })),
    prepareAsset: async (_assetId, networkAccessAllowed) => {
      if (!networkAccessAllowed) return "requiresDownload";
      return {
        file: new File(["storybook-photo"], "photo-roulette.jpg", { type: "image/jpeg" }),
        width: 1280,
        height: 960,
        bytes: 15,
        alreadyCompressed: true,
      };
    },
    cancelPrepare: async () => {},
    endSession: async () => {},
    onDownloadProgress: async () => ({ remove: async () => {} }),
  };
}

const largeLibrary: PhotoAsset[] = Array.from({ length: 120 }, (_, index) => ({
  id: `library-photo-${index + 1}`,
  capturedAt: Date.UTC(2026, 7, 18) - index * 60 * 60_000,
  lat: 35.0116 - index * 0.002,
  lon: 135.7681 + index * 0.002,
  pixelWidth: 4032,
  pixelHeight: 3024,
}));

const meta = {
  title: "Map/PhotoRouletteSheet",
  component: PhotoRouletteSheet,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen bg-[linear-gradient(145deg,#d9e7d3,#9ec5d4)]">
        <Story />
      </div>
    ),
  ],
  args: {
    open: true,
    cutoffAt: null,
    adapter: createAdapter(),
    resolveNearestTrail: async (capturedAtMs) => capturedAtMs.map((capturedAtMs) => ({
      capturedAtMs,
      sample: {
        _id: `trail-${capturedAtMs}`,
        lat: 34.9858,
        lon: 135.7588,
        sampledAt: capturedAtMs - 12 * 60_000,
      },
      deltaMs: 12 * 60_000,
    })),
    onMapCoordinate: fn(),
    onUsePhoto: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof PhotoRouletteSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @tag ai-generated */
export const AuthorizedLibrary: Story = {};

/** @tag ai-generated */
export const LimitedLibrary: Story = {
  args: { adapter: createAdapter("limited") },
};

/** @tag ai-generated */
export const PermissionDenied: Story = {
  args: { adapter: createAdapter("denied") },
};

/** @tag ai-generated */
export const RestoredLargeLibrary: Story = {
  args: { adapter: createAdapter("authorized", largeLibrary) },
  render: (args) => {
    localStorage.setItem("tripcast.photo-roulette.last-asset", "library-photo-80");
    return <PhotoRouletteSheet {...args} />;
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText("80 of 120")).toBeInTheDocument();
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import TrailCompressionReview, { TrailCompressionView } from "./TrailCompressionReview";
import { tripcastApi } from "../../convex/tripcastApi";
const points = Array.from({ length: 48 }, (_, i) => ({ id: String(i), lat: 47.6 + i * 0.0001, lon: -122.33 + Math.sin(i / 8) * 0.002, t: 1_760_000_000_000 + i * 5000, kept: i % 8 === 0 || i === 47 }));
const meta = {
  title: "Options/TrailCompressionReview", component: TrailCompressionView,
  parameters: { layout: "fullscreen" },
  args: { open: true, onOpenChange: () => {}, points, done: false, loading: false, stopping: false, started: true, error: null, stale: false, ended: true, imageStatus: "2/8 images ready · 1 failed.", onImages: () => {}, onLoad: () => {}, onStop: () => {}, onReload: () => {}, onCompress: () => {}, busy: false, ready: false },
} satisfies Meta<typeof TrailCompressionView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Partial: Story = {};
export const DarkMode: Story = { globals: { theme: "constellation" } };
export const LoadingAll: Story = { args: { loading: true } };
export const Stopping: Story = { args: { loading: true, stopping: true } };
export const Stopped: Story = {};
export const Complete: Story = { args: { done: true } };
export const Empty: Story = { args: { points: [], done: true } };
export const Failed: Story = { args: { error: "Connection interrupted. Retry the next batch to continue." } };
export const Stale: Story = { args: { stale: true } };
export const ActiveTrip: Story = { args: { points: [], started: false, ended: false } };

// Exercise the real paged controller without reading or changing deployment data.
export const InteractiveFlow: Story = {
  render: () => <TrailCompressionReview token="storybook-local" open onOpenChange={() => {}} />,
  parameters: { convexMocks: { queries: [
    { query: tripcastApi.replayRoutes.manifest, result: { sourceRevision: "fixture:1", compressionVersion: 1, contentRevision: 1, revision: 0, ready: false, enabled: false, visible: true, cutoff: null, authorization: "fixture", ended: true } },
    { query: tripcastApi.replayImages.inventory, result: { page: [{ source: "pending", bytes: 2_000_000, status: "pending", previewBytes: 0 }], isDone: true, continueCursor: "" } },
    { query: tripcastApi.replayRoutes.preview, result: async ({ cursor }: { cursor: string | null }) => {
      await new Promise(resolve => setTimeout(resolve, 80));
      const offset = Number(cursor ?? 0);
      return { points: Array.from({ length: 128 }, (_, i) => ({ ...points[i % points.length], id: String(offset + i), lat: points[i % points.length].lat + Math.floor((offset + i) / 48) * .002 })), day: 0, cursor: String(offset + 128), done: offset + 128 >= 3072, sourceRevision: "fixture:1", compressionVersion: 1 };
    } },
  ] } },
};

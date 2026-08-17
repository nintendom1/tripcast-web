import type { Meta, StoryObj } from "@storybook/react-vite";
import { OfflineBreadcrumbNotice } from "./OfflineBreadcrumbNotice";

const meta = {
  title: "HUD/OfflineBreadcrumbNotice",
  component: OfflineBreadcrumbNotice,
  args: {
    phase: "offline",
    breadcrumbCount: 37,
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm bg-[var(--bg-canvas)] p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OfflineBreadcrumbNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Offline: Story = {};

export const OfflineBeforeFirstBreadcrumb: Story = {
  args: { phase: "offline", breadcrumbCount: 0 },
};

export const Reconnecting: Story = {
  args: { phase: "syncing", breadcrumbCount: 21 },
};

export const SyncDelayed: Story = {
  args: { phase: "retrying", breadcrumbCount: 21 },
};

export const StorageFull: Story = {
  args: { phase: "offline", breadcrumbCount: 10_000, capacityReached: true },
};

export const StorageError: Story = {
  args: { phase: "storage-error", breadcrumbCount: 12 },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ConvexUsageOptionsRow } from "./OptionsSheet";
import { USAGE_GUARD, type UsageLedger } from "../../lib/usageWarning";

const LEDGER: UsageLedger = {
  buckets: [],
  policy: {
    emissionIntervalSeconds: 15,
    maxBatchSize: 20,
    maxQueueDepth: 10_000,
    minEmissionIntervalSeconds: 3,
    heartbeatIntervalSeconds: 60,
    minDistanceMeters: 10,
    minBearingDistanceMeters: 3,
    turnThresholdDegrees: 18,
  },
  estimate: {
    monthKey: "2026-11",
    uploads: 203_550,
    bytes: 203_550 * USAGE_GUARD.bytesPerUpload,
    limitBytes: USAGE_GUARD.monthlyLimitBytes,
    paused: false,
  },
};

const meta = {
  title: "Options/ConvexUsageOptionsRow",
  component: ConvexUsageOptionsRow,
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-[var(--bg-paper)] p-4 text-[var(--ink-1)]">
        <div className="mx-auto max-w-xl overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] shadow-sm">
          <Story />
        </div>
      </div>
    ),
  ],
  args: { role: "traveler", usage: undefined, countersAvailable: true, onClick: fn() },
} satisfies Meta<typeof ConvexUsageOptionsRow>;

export default meta;
type Story = StoryObj<typeof meta>;

// iOS app, before the first read of the phone's counters.
export const Loading: Story = {};

// Off iOS (web or Android), or the counters could not be read.
export const NoEstimateOnThisDevice: Story = { args: { countersAvailable: false } };

export const Level: Story = { args: { usage: { ledger: LEDGER, level: "critical" } } };

export const Follower: Story = { args: { role: "follower" } };

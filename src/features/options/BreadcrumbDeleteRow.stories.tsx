import type { Meta, StoryObj } from "@storybook/react-vite";
import { BreadcrumbDeleteRow } from "./BreadcrumbDeleteRow";

const T = Date.UTC(2026, 5, 25, 21, 0, 0); // base sample time

// ~150m north of the origin, one minute later → real movement, ~2.5 m/s (not jitter).
const origin = { _id: "s1", lat: 45, lon: -122, sampledAt: T };
const normal = { _id: "s2", lat: 45.00135, lon: -122, sampledAt: T + 60_000 };
// ~600m from `normal` in 3 seconds → ~200 m/s, an implausible GPS jump.
const jump = { _id: "s3", lat: 45.00675, lon: -122, sampledAt: T + 63_000 };

const meta = {
  title: "Options/BreadcrumbDeleteRow",
  component: BreadcrumbDeleteRow,
  parameters: { layout: "centered" },
  args: { timeZone: "America/Los_Angeles", checked: false, onToggle: () => {} },
  decorators: [
    (Story) => (
      <div className="w-[360px] overflow-hidden rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BreadcrumbDeleteRow>;
export default meta;

/** First row has no previous point, so no distance/time badge. */
export const FirstRow: StoryObj<typeof meta> = {
  args: { index: 0, sample: origin, prevSample: null },
};

/** Real travel: distance exceeds the floor but implied speed is plausible — neutral badge. */
export const NormalMovement: StoryObj<typeof meta> = {
  args: { index: 1, sample: normal, prevSample: origin },
};

/** Large jump over a few seconds → implausible speed, flagged as possible jitter. */
export const Jitter: StoryObj<typeof meta> = {
  args: { index: 2, sample: jump, prevSample: normal },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { ConvexUsageStatusLine } from "./OptionsSheet";

const meta = {
  title: "Options/ConvexUsageStatusLine",
  component: ConvexUsageStatusLine,
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-[var(--bg-paper)] p-4 text-[var(--ink-1)]">
        <div className="mx-auto max-w-xl">
          <Story />
        </div>
      </div>
    ),
  ],
  args: { level: "warn", onOpen: fn() },
} satisfies Meta<typeof ConvexUsageStatusLine>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Warn: Story = {};

export const Critical: Story = { args: { level: "critical" } };

export const Paused: Story = { args: { level: "paused" } };

// No line while the estimate is OK, or when there is no estimate (off iOS, no counters, no guard);
// the Developer row still shows the state.
export const HiddenWithoutWarning: Story = {
  args: { level: null },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-convex-usage-status-line]")).toBeNull();
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";

import { SideloadProfileCountdownRow } from "./SideloadProfileCountdownRow";

const NOW = Date.UTC(2026, 6, 24, 9, 0);

const meta = {
  title: "Options/SideloadProfileCountdownRow",
  component: SideloadProfileCountdownRow,
  decorators: [
    (Story) => (
      <div className="mx-auto mt-8 w-[min(100%-2rem,36rem)] overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] shadow-sm">
        <Story />
      </div>
    ),
  ],
  args: {
    nowMs: NOW,
    locale: "en-US",
    timeZone: "UTC",
  },
} satisfies Meta<typeof SideloadProfileCountdownRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {
  args: {
    expiresAtMs: NOW + 5 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000,
  },
};

export const Warning: Story = {
  args: {
    expiresAtMs: NOW + 36 * 60 * 60 * 1000,
  },
};

export const Critical: Story = {
  args: {
    expiresAtMs: NOW + 8 * 60 * 60 * 1000 + 12 * 60 * 1000,
  },
};

export const Expired: Story = {
  args: {
    expiresAtMs: NOW - 30 * 60 * 1000,
  },
};

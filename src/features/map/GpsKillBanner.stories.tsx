import type { Meta, StoryObj } from "@storybook/react-vite";

import { GpsKillBanner } from "./GpsKillBanner";

const meta = {
  title: "Map/GpsKillBanner",
  component: GpsKillBanner,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="w-[min(420px,calc(100vw-24px))]">
        <Story />
      </div>
    ),
  ],
  args: {
    onEnable: () => {},
  },
} satisfies Meta<typeof GpsKillBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @tag ai-generated */
export const Countdown: Story = {
  args: {
    status: "stopped",
    secondsRemaining: 24,
  },
};

/** @tag ai-generated */
export const Stopping: Story = {
  args: {
    status: "stopping",
    secondsRemaining: 30,
  },
};

/** @tag ai-generated */
export const StopUnconfirmed: Story = {
  args: {
    status: "unconfirmed",
    secondsRemaining: 27,
  },
};

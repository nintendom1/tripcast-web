import type { Meta, StoryObj } from "@storybook/react-vite";

import ReplaySettingsSheet from "./ReplaySettingsSheet";

const meta = {
  title: "Map/ReplaySettingsSheet",
  component: ReplaySettingsSheet,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    open: true,
    speed: 2,
    onChangeSource: () => {},
    onChangeSpeed: () => {},
    onRestart: () => {},
    onExit: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof ReplaySettingsSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

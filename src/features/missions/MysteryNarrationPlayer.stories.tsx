import type { Meta, StoryObj } from "@storybook/react-vite";

import MysteryNarrationPlayer from "./MysteryNarrationPlayer";

const meta = {
  title: "Missions/MysteryNarrationPlayer",
  component: MysteryNarrationPlayer,
  args: {
    missionId: "mystery-preview",
    narration: "Look for the narrow path beside the old stone gate.",
  },
  decorators: [
    (Story) => (
      <div className="mystery-theme max-w-md bg-[var(--bg-paper)] p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MysteryNarrationPlayer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

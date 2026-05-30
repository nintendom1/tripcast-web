import type { Meta, StoryObj } from "@storybook/react";
import { TopBar } from "./TopBar";

const meta = {
  title: "HUD/TopBar",
  component: TopBar,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs", "ai-generated"],
} satisfies Meta<typeof TopBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Traveler: Story = {
  args: {
    role: "traveler",
    onOpenOptions: () => console.log("Open options"),
  },
};

export const Follower: Story = {
  args: {
    role: "follower",
    onOpenOptions: () => console.log("Open options"),
  },
};

import type { Meta, StoryObj } from "@storybook/react";
import { GameToast } from "./GameToast";

const meta = {
  title: "UI/GameToast",
  component: GameToast,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs", "ai-generated"],
} satisfies Meta<typeof GameToast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "New Achievement!",
    subtitle: "You've unlocked the 'Mountain Climber' badge.",
    kind: "badge",
  },
};

export const Warning: Story = {
  args: {
    title: "Low Stamina",
    subtitle: "Rest soon to avoid exhaustion.",
    kind: "activity",
    accent: "var(--amber)",
  },
};

export const Error: Story = {
  args: {
    title: "Connection Lost",
    subtitle: "Unable to sync with the server.",
    kind: "activity",
    accent: "var(--flag)",
  },
};

export const LongMessage: Story = {
  args: {
    title: "Special Quest Available",
    subtitle: "The local guide has a very important task for you that involves traveling across the valley to the ancient ruins before the sun sets tonight.",
    kind: "point",
  },
};

import type { Meta, StoryObj } from "@storybook/react";
import { StatBar } from "./StatBar";

const meta = {
  title: "RPG/StatBar",
  component: StatBar,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs", "ai-generated"],
  decorators: [
    (Story) => (
      <div className="w-[300px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: 75,
    label: "Energy",
  },
};

export const Full: Story = {
  args: {
    value: 100,
    label: "Stomach",
    colorClass: "bg-[var(--green)]",
  },
};

export const Low: Story = {
  args: {
    value: 15,
    label: "Calm",
    colorClass: "bg-[var(--flag)]",
  },
};

export const Warning: Story = {
  args: {
    value: 40,
    label: "Stress",
    colorClass: "bg-[var(--amber)]",
  },
};

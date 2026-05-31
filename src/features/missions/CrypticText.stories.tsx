import type { Meta, StoryObj } from "@storybook/react-vite";
import CrypticText from "./CrypticText";

const meta = {
  title: "Missions/CrypticText",
  component: CrypticText,
  args: {
    text: "SIGNAL: VERMILION",
    className: "font-[var(--font-display)] text-3xl font-extrabold text-[var(--ink-1)]",
  },
} satisfies Meta<typeof CrypticText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Signal: Story = {};

export const Gate: Story = {
  args: { text: "gAtE//gAtE" },
};

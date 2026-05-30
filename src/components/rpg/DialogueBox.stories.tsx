import type { Meta, StoryObj } from "@storybook/react";
import { DialogueBox } from "./DialogueBox";

const meta = {
  title: "RPG/DialogueBox",
  component: DialogueBox,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs", "ai-generated"],
  decorators: [
    (Story) => (
      <div className="w-[390px] p-4 bg-[var(--bg-paper)]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DialogueBox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Traveler",
    children: "Hello there! Welcome to the world of TripCast. Are you ready for an adventure?",
  },
};

export const LongText: Story = {
  args: {
    title: "Old Guide",
    children: "The path ahead is long and treacherous. You will need to gather your strength and prepare for the challenges that await you in the valley beyond the mountains. Do not forget to check your vitals regularly and rest when you need to.",
  },
};

export const WithoutTitle: Story = {
  args: {
    children: "This is a simple dialogue box without a title character.",
  },
};

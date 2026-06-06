/** @tag ai-generated */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IntroSequence } from "../features/onboarding/IntroSequence";

const meta: Meta<typeof IntroSequence> = {
  title: "Onboarding/IntroSequence",
  component: IntroSequence,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    role: "follower",
    accountLabel: "test-user",
    userHandle: "test-user",
    travelerName: "the Traveler",
    onDone: (reason) => console.log("Done:", reason),
  },
};

export default meta;
type Story = StoryObj<typeof IntroSequence>;

export const Follower: Story = {};

export const Traveler: Story = {
  args: {
    role: "traveler",
  },
};

/** @tag ai-generated */
import type { Meta, StoryObj } from "@storybook/react";
import { CreateAccountIntroFlow } from "../IntroSequence";

const meta: Meta<typeof CreateAccountIntroFlow> = {
  title: "Onboarding/CreateAccountIntroFlow",
  component: CreateAccountIntroFlow,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    token: "test-token",
    role: "follower",
    accountLabel: "test-user",
    userHandle: "test-user",
    travelerName: "the Traveler",
    onDone: () => console.log("Done"),
  },
};

export default meta;
type Story = StoryObj<typeof CreateAccountIntroFlow>;

export const Default: Story = {};

export const Dark: Story = {
  parameters: {
    theme: "constellation",
  },
};

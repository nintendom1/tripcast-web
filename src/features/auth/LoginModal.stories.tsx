import type { Meta, StoryObj } from "@storybook/react-vite";

import LoginModal from "./LoginModal";

const meta = {
  title: "Auth/LoginModal",
  component: LoginModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onOpenChange: () => {},
    onSignIn: () => {},
  },
} satisfies Meta<typeof LoginModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoginModalFollower: Story = {
  args: {
    initialView: "follower",
  },
};

export const LoginModalTraveler: Story = {
  args: {
    initialView: "traveler",
  },
};

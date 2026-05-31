import type { Meta, StoryObj } from "@storybook/react-vite";

import { tripcastApi } from "../../convex/tripcastApi";
import CreateInviteControl from "./CreateInviteControl";

const meta = {
  title: "Followers/CreateInviteControl",
  component: CreateInviteControl,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="w-[360px] rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-4 sm:w-[520px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CreateInviteControl>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @tag ai-generated */
export const Default: Story = {
  args: {
    token: "traveler-token",
  },
  parameters: {
    convexMocks: {
      mutations: [
        {
          mutation: tripcastApi.followerAdmin.createInvite,
          result: async ({ mode }: { mode?: "single" | "multi" }) => ({
            inviteToken: mode === "multi" ? "invite-many-token" : "invite-one-token",
          }),
        },
      ],
    },
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import InviteRedemptionScreen from "./InviteRedemptionScreen";
import { StorybookConvexProvider, useConvexMock } from "../../stories/convex-mock";
import { tripcastApi } from "../../convex/tripcastApi";
import { useEffect } from "react";

const meta: Meta<typeof InviteRedemptionScreen> = {
  title: "Auth/InviteRedemptionScreen",
  component: InviteRedemptionScreen,
  decorators: [
    (Story) => (
      <StorybookConvexProvider>
        <Story />
      </StorybookConvexProvider>
    ),
  ],
  args: {
    inviteToken: "test-token",
    onSignIn: () => console.log("onSignIn"),
    onBack: () => console.log("onBack"),
  },
};

export default meta;
type Story = StoryObj<typeof InviteRedemptionScreen>;

const MockStatus = ({ status }: { status: "valid" | "expired" | "already_used" | "invalid" | undefined }) => {
  const { setQueryMock } = useConvexMock();
  useEffect(() => {
    setQueryMock(tripcastApi.followers.getInviteStatus, status === undefined ? undefined : { status });
  }, [setQueryMock, status]);
  return null;
};

export const Loading: Story = {
  render: (args) => (
    <>
      <MockStatus status={undefined} />
      <InviteRedemptionScreen {...args} />
    </>
  ),
};

export const Valid: Story = {
  render: (args) => (
    <>
      <MockStatus status="valid" />
      <InviteRedemptionScreen {...args} />
    </>
  ),
};

export const Expired: Story = {
  render: (args) => (
    <>
      <MockStatus status="expired" />
      <InviteRedemptionScreen {...args} />
    </>
  ),
};

export const AlreadyUsed: Story = {
  render: (args) => (
    <>
      <MockStatus status="already_used" />
      <InviteRedemptionScreen {...args} />
    </>
  ),
};

export const Invalid: Story = {
  render: (args) => (
    <>
      <MockStatus status="invalid" />
      <InviteRedemptionScreen {...args} />
    </>
  ),
};

import type { Meta, StoryObj } from "@storybook/react";
import { OptionsRow } from "./OptionsSheet";
import { Settings, User, Wallet, ShieldAlert, LogOut } from "lucide-react";

const meta = {
  title: "Options/OptionsRow",
  component: OptionsRow as any,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs", "ai-generated"],
  decorators: [
    (Story) => (
      <div className="w-[390px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<any>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: Settings,
    title: "General Settings",
    detail: "Manage your account preferences",
    onClick: () => console.log("Clicked row"),
  },
};

export const Account: Story = {
  args: {
    icon: User,
    title: "Profile",
    detail: "Update your personal information",
    onClick: () => console.log("Clicked row"),
  },
};

export const TravelFunds: Story = {
  args: {
    icon: Wallet,
    title: "Travel Funds",
    detail: "Budget, pace, and transactions",
    onClick: () => console.log("Clicked row"),
  },
};

export const Danger: Story = {
  args: {
    icon: ShieldAlert,
    title: "Emergency Reset",
    detail: "Wipe shared trip data",
    danger: true,
    onClick: () => console.log("Clicked row"),
  },
};

export const SignOut: Story = {
  args: {
    icon: LogOut,
    title: "Sign out",
    danger: true,
    onClick: () => console.log("Clicked row"),
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PendingBreadcrumbPauseDialog } from "./PendingBreadcrumbPauseDialog";

const meta = {
  title: "HUD/PendingBreadcrumbPauseDialog",
  component: PendingBreadcrumbPauseDialog,
  args: {
    open: true,
    breadcrumbCount: 37,
    onOpenChange: fn(),
    onKeep: fn(),
    onDiscard: fn(),
  },
} satisfies Meta<typeof PendingBreadcrumbPauseDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const UploadsPaused: Story = { args: { phase: "paused", breadcrumbCount: 214 } };

export const SignInExpired: Story = { args: { phase: "sign-in-expired", breadcrumbCount: 58 } };

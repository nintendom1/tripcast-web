import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LiveSafetyNotice } from "./LiveSafetyNotice";

const meta = {
  title: "HUD/LiveSafetyNotice",
  component: LiveSafetyNotice,
  args: { kind: "capture", onRetry: fn(), onOpenSettings: fn() },
  decorators: [(Story) => <div className="max-w-sm bg-[var(--bg-canvas)] p-6"><Story /></div>],
} satisfies Meta<typeof LiveSafetyNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RetryableCaptureFailure: Story = {};
export const ActivityDisabled: Story = { args: { kind: "activity" } };

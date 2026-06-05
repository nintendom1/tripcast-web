import type { Meta, StoryObj } from "@storybook/react-vite";
import QuickActivitySettingsView from "./QuickActivitySettings";

/** @tag ai-generated */
const meta: Meta<typeof QuickActivitySettingsView> = {
  title: "Features/Options/QuickActivitySettings",
  component: QuickActivitySettingsView,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="p-4 max-w-md mx-auto bg-[var(--bg-paper)] min-h-screen">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof QuickActivitySettingsView>;

export const Default: Story = {
  args: {
    token: "mock-token",
  },
};

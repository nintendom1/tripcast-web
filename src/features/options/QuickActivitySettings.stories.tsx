import type { Meta, StoryObj } from "@storybook/react-vite";
import { tripcastApi } from "../../convex/tripcastApi";
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
  parameters: {
    convexMocks: {
      queries: [
        {
          query: tripcastApi.currentActivity.travelerGetQuickActivitySettings,
          result: {
            activities: [
              { label: "Walking", emoji: "🚶" },
              { label: "Eating", emoji: "🍽️" },
              { label: "Taking train", emoji: "🚆" },
              { label: "Resting", emoji: "🪑" },
              { label: "Exploring", emoji: "🧭" },
              { label: "Shopping", emoji: "🛒" },
              { label: "Errands", emoji: "💻" },
              { label: "Sleeping", emoji: "🛏️" },
            ],
            displayCount: 6,
            updatedAt: Date.now() - 60_000,
            updatedBySessionId: "session-storybook",
          },
        },
      ],
      mutations: [
        {
          mutation: tripcastApi.currentActivity.travelerUpdateQuickActivitySettings,
          result: null,
        },
      ],
    },
  },
};

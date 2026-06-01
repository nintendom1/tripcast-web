import type { Meta, StoryObj } from "@storybook/react-vite";
import { TripTickerSettings } from "./OptionsSheet";

/** @tag ai-generated */
const meta: Meta<typeof TripTickerSettings> = {
  title: "Options/TripTickerSettings",
  component: TripTickerSettings,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="p-4 bg-[var(--bg-paper)] min-h-screen">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TripTickerSettings>;

export const Default: Story = {
  args: {
    token: "mock-token"
  },
  play: async () => {
    // Fill localStorage with some data for the story
    const mockSettings = {
      enabled: true,
      priorityMessages: [{ id: "p1", text: "⚠️ Low reception expected in the valley." }],
      funFacts: [{ id: "f1", text: "🇯🇵 This is my 3rd time in Japan!" }],
      funFactsEnabled: true,
      funFactIntervalMinutes: 10,
      lastFunFactAt: 0,
    };
    localStorage.setItem("tripcast.ticker_settings", JSON.stringify(mockSettings));
    window.dispatchEvent(new Event("storage"));
  }
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { TripTicker } from "./TripTicker";

/** @tag ai-generated */
const meta: Meta<typeof TripTicker> = {
  title: "HUD/TripTicker",
  component: TripTicker,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="min-h-[200px] bg-slate-100 p-4">
        <Story />
        <div className="mt-8 p-4 border border-dashed border-slate-300 text-slate-400 text-xs text-center">
          Map Area
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TripTicker>;

export const PriorityMessage: Story = {
  args: {
    message: { id: "1", text: "⚠️ Joshua anticipates low reception; updates may pause." },
    isPriority: true,
  },
};

export const FunFact: Story = {
  args: {
    message: { id: "2", text: "🇯🇵 This is Joshua’s third trip to Japan." },
    isPriority: false,
  },
};

export const LongMessage: Story = {
  args: {
    message: {
      id: "3",
      text: "🚀 Did you know that the TripCast prototype was originally designed to work entirely offline using local-only caches and opportunistic sync? 📱"
    },
    isPriority: false,
  },
};

export const ConstellationTheme: Story = {
  args: {
    message: { id: "4", text: "🌌 Looking at the stars in dark mode." },
    isPriority: true,
  },
  parameters: {
    theme: "constellation",
  },
};

export const MobileViewport: Story = {
  args: {
    message: { id: "5", text: "📱 Mobile view ticker message" },
    isPriority: false,
  },
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
  },
};

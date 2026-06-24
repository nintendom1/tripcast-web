import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusCard } from "./StatusCard";
const meta = { title: "HUD/StatusCard", component: StatusCard, parameters: { layout: "centered" }, decorators: [(Story) => <div className="w-[390px] p-4"><Story /></div>] } satisfies Meta<typeof StatusCard>;
export default meta;
 /** @tag ai-generated */
export const Default: StoryObj<typeof meta> = {
  args: {
    activityLabel: "Hiking",
    activityEmoji: "🥾",
    activitySince: "for 2h 15m",
    statusMeta: "Schedule: On track",
    clockLabel: "2:45 PM",
    meters: [
      { label: "Energy", value: 45, valueLabel: "45%", color: "var(--amber)" },
      { label: "Fullness", value: 85, valueLabel: "85%", color: "var(--green)" },
      { label: "Calm", value: 92, valueLabel: "92%", color: "var(--teal)" },
    ],
  },
};

export const Overfilled: StoryObj<typeof meta> = {
  args: {
    activityLabel: "Lunch Break",
    activityEmoji: "🍝",
    activitySince: "just now",
    statusMeta: "Schedule: Relaxed",
    clockLabel: "1:15 PM",
    meters: [
      { label: "Energy", value: 80, valueLabel: "80%", color: "var(--amber)" },
      {
        label: "Fullness",
        value: 125,
        valueLabel: "125%",
        color: "var(--green)",
        overfillColor: "var(--flag)",
      },
      { label: "Calm", value: 95, valueLabel: "95%", color: "var(--teal)" },
    ],
  },
};

export const Stuffed: StoryObj<typeof meta> = {
  args: {
    activityLabel: "Dinner Party",
    activityEmoji: "🍕",
    activitySince: "for 45m",
    clockLabel: "8:30 PM",
    meters: [
      {
        label: "Fullness",
        value: 150,
        valueLabel: "150%",
        color: "var(--green)",
        overfillColor: "var(--flag)",
      },
    ],
  },
};

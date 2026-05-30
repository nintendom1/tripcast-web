import type { Meta, StoryObj } from "@storybook/react";
import { StatusCard } from "./StatusCard";

const meta = {
  title: "HUD/StatusCard",
  component: StatusCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs", "ai-generated"],
  decorators: [
    (Story) => (
      <div className="w-[390px] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatusCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultMeters = [
  { label: "Energy", value: 85, valueLabel: "85%" },
  { label: "Stomach", value: 45, valueLabel: "45%" },
  { label: "Calm", value: 70, valueLabel: "70%" },
];

export const Default: Story = {
  args: {
    activityLabel: "Hiking the trail",
    activityEmoji: "🥾",
    activitySince: "2h ago",
    statusMeta: "High elevation",
    clockLabel: "14:30",
    meters: defaultMeters,
  },
};

export const LowVitals: Story = {
  args: {
    activityLabel: "Resting",
    activityEmoji: "😴",
    activitySince: "30m ago",
    statusMeta: "Near basecamp",
    clockLabel: "10:15",
    meters: [
      { label: "Energy", value: 15, valueLabel: "15%" },
      { label: "Stomach", value: 25, valueLabel: "25%" },
      { label: "Calm", value: 90, valueLabel: "90%" },
    ],
  },
};

export const Interactive: Story = {
  args: {
    activityLabel: "Exploring Downtown",
    activityEmoji: "🏙️",
    activitySince: "15m ago",
    statusMeta: "Sunny weather",
    clockLabel: "12:00",
    meters: defaultMeters,
    interactive: true,
    onActivate: () => console.log("Card activated"),
  },
};

export const Stale: Story = {
  args: {
    activityLabel: "Last seen at Market",
    activityEmoji: "🍎",
    activitySince: "5h ago",
    statusMeta: "Signal lost",
    clockLabel: "09:00",
    meters: defaultMeters,
    staleInfo: "Location might be outdated",
  },
};

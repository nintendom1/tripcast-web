import type { Meta, StoryObj } from "@storybook/react";
import MissionCard from "./MissionCard";
import { FAKE_MISSIONS } from "../../stories/fixtures/tripcast";

const meta = {
  title: "Missions/MissionCard",
  component: MissionCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs", "ai-generated"],
  decorators: [
    (Story) => (
      <div className="w-[390px] p-4 bg-[var(--bg-paper)]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MissionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseMission: any = {
  _id: "m1",
  title: "Explore the Ancient Ruins",
  description: "Find the hidden entrance behind the waterfall.",
  status: "visible",
  source: "traveler",
  locationLabel: "Crystal Falls",
  estimatedDurationMinutes: 45,
  estimatedCostUsd: 0,
  estimatedEnergyImpact: "medium",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

export const Default: Story = {
  args: {
    Mission: baseMission,
  },
};

export const InProgress: Story = {
  args: {
    Mission: {
      ...baseMission,
      status: "in_progress",
    },
  },
};

export const Completed: Story = {
  args: {
    Mission: {
      ...baseMission,
      status: "completed",
    },
  },
};

export const ViaVote: Story = {
  args: {
    Mission: {
      ...baseMission,
      source: "route_vote",
    },
  },
};

export const Highlighted: Story = {
  args: {
    Mission: baseMission,
    isHighlighted: true,
  },
};

export const LongTitleAndDescription: Story = {
  args: {
    Mission: {
      ...baseMission,
      title: "The Extremely Long and Detailed Quest of the Seven Secret Sapphires of the Lost Sunken Temple of the Infinite Deep",
      description: "You must travel across the seven seas, battle the kraken, and solve the riddles of the ancient mariners before you can even begin to look for the first sapphire.",
    },
  },
};

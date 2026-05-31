import type { Meta, StoryObj } from "@storybook/react-vite";
import MissionCard from "./MissionCard";
import { FAKE_MISSION } from "../../stories/fixtures/tripcast";

const meta = {
  title: "Missions/MissionCard",
  component: MissionCard,
  argTypes: {
    onClick: { action: "clicked" },
  },
} satisfies Meta<typeof MissionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @tag ai-generated */
export const Proposed: Story = {
  args: {
    Mission: {
      ...FAKE_MISSION,
      status: "proposed",
      source: "follower",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any,
  },
};

/** @tag ai-generated */
export const InProgress: Story = {
  args: {
    Mission: {
      ...FAKE_MISSION,
      status: "in_progress",
      source: "traveler",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any,
  },
};

/** @tag ai-generated */
export const Completed: Story = {
  args: {
    Mission: {
      ...FAKE_MISSION,
      status: "completed",
      source: "traveler",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any,
  },
};

/** @tag ai-generated */
export const Highlighted: Story = {
  args: {
    Mission: {
      ...FAKE_MISSION,
      status: "in_progress",
      source: "traveler",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any,
    isHighlighted: true,
  },
};

/** @tag ai-generated */
export const ViaVote: Story = {
  args: {
    Mission: {
      ...FAKE_MISSION,
      status: "in_progress",
      source: "route_vote",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any,
  },
};

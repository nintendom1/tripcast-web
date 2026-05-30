import type { Meta, StoryObj } from "@storybook/react";
import { VoteCard } from "./RouteVotePanel";

const meta = {
  title: "RouteVote/VoteCard",
  component: VoteCard as any,
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
} satisfies Meta<any>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseVote: any = {
  _id: "v1",
  title: "Next City Destination",
  effectiveStatus: "active",
  expiresAt: Date.now() + 86400000,
  totalSubmissions: 12,
  options: [
    { _id: "o1", title: "Kyoto", locationLabel: "Japan" },
    { _id: "o2", title: "Osaka", locationLabel: "Japan" },
    { _id: "o3", title: "Nara", locationLabel: "Japan" },
  ],
  optionVoteCounts: {
    o1: 5,
    o2: 4,
    o3: 3,
  },
};

export const Active: Story = {
  args: {
    vote: baseVote,
    showTallies: true,
    onSelect: () => console.log("Selected vote"),
  },
};

export const ActiveHiddenTallies: Story = {
  args: {
    vote: baseVote,
    showTallies: false,
    onSelect: () => console.log("Selected vote"),
  },
};

export const Resolved: Story = {
  args: {
    vote: {
      ...baseVote,
      effectiveStatus: "resolved",
      confirmedWinningOptionId: "o1",
      resultingMissionId: "m1",
    },
    showTallies: true,
    onSelect: () => console.log("Selected vote"),
  },
};

export const Closed: Story = {
  args: {
    vote: {
      ...baseVote,
      effectiveStatus: "closed",
    },
    showTallies: true,
    onSelect: () => console.log("Selected vote"),
  },
};

export const Tied: Story = {
  args: {
    vote: {
      ...baseVote,
      isTied: true,
      optionVoteCounts: {
        o1: 5,
        o2: 5,
        o3: 2,
      },
    },
    showTallies: true,
    onSelect: () => console.log("Selected vote"),
  },
};

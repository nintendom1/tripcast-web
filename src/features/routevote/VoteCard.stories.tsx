import type { Meta, StoryObj } from "@storybook/react-vite";
import { VoteCard } from "./RouteVotePanel";
import { tripcastApi } from "../../convex/tripcastApi";

const meta = {
  title: "RouteVote/VoteCard",
  component: VoteCard as any,
  parameters: {
    layout: "centered",
    convexMocks: {
      mutations: [{ mutation: tripcastApi.reactions.toggleReaction, result: null }],
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[390px] p-4 bg-[var(--bg-paper)]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<any>;
export default meta;

const baseVote: any = {
  _id: "v1",
  title: "Next City",
  effectiveStatus: "active",
  options: [],
  optionVoteCounts: {},
  expiresAt: Date.now() + 86400_000,
  totalSubmissions: 4,
  reactions: {
    entries: [{ emoji: "❤️", count: 3 }, { emoji: "👍", count: 1 }],
    myReaction: "👍",
  },
};

/** @tag ai-generated */
export const Active: StoryObj<typeof meta> = {
  args: { vote: baseVote, token: "mock-token", showTallies: true, onSelect: () => {} },
};

/** @tag ai-generated */
export const ReactionsStress: StoryObj<typeof meta> = {
  args: {
    vote: {
      ...baseVote,
      title: "Where do we sleep tonight? A long question that wraps",
      reactions: {
        entries: [
          { emoji: "❤️", count: 12 },
          { emoji: "👍", count: 8 },
          { emoji: "😲", count: 5 },
          { emoji: "😡", count: 1 },
          { emoji: "😹", count: 7 },
          { emoji: "😕", count: 2 },
        ],
        myReaction: "😹",
      },
    },
    token: "mock-token",
    showTallies: true,
    onSelect: () => {},
  },
};

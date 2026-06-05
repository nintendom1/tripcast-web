import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReactionSection } from "./ReactionSection";
import { tripcastApi } from "../../convex/tripcastApi";

const meta = {
  title: "UI/ReactionSection",
  component: ReactionSection,
  parameters: {
    layout: "centered",
    convexMocks: {
      mutations: [{ mutation: tripcastApi.reactions.toggleReaction, result: null }],
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[360px] rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReactionSection>;

export default meta;
type Story = StoryObj<typeof meta>;

const BASE_ARGS = {
  targetId: "cp1",
  targetType: "checkpoint" as const,
  token: "mock-token",
};

const MIXED_ENTRIES = [
  { emoji: "❤️", count: 5 },
  { emoji: "👍", count: 2 },
  { emoji: "😹", count: 1 },
];

/** @tag ai-generated */
export const Empty: Story = {
  args: { ...BASE_ARGS, reactions: { entries: [] } },
};

/** @tag ai-generated */
export const Mixed: Story = {
  args: { ...BASE_ARGS, reactions: { entries: MIXED_ENTRIES } },
};

/** @tag ai-generated */
export const MineHighlighted: Story = {
  args: {
    ...BASE_ARGS,
    reactions: { entries: MIXED_ENTRIES, myReaction: "❤️" },
  },
};

/** @tag ai-generated */
export const RightAligned: Story = {
  args: {
    ...BASE_ARGS,
    reactions: {
      entries: [{ emoji: "❤️", count: 3 }, { emoji: "👍", count: 1 }],
      myReaction: "👍",
    },
    className: "flex justify-end",
  },
};

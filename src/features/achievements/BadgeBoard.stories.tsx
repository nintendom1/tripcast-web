import type { Meta, StoryObj } from "@storybook/react-vite";

import type { BadgeBoardEntry } from "../../convex/tripcastApi";
import BadgeBoard from "./BadgeBoard";

const meta = {
  title: "Achievements/BadgeBoard",
  component: BadgeBoard,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-[390px] bg-[var(--bg-paper)] p-5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BadgeBoard>;

export default meta;

type Story = StoryObj<typeof meta>;

const badges: BadgeBoardEntry[] = [
  {
    badgeType: "life_changing",
    name: "Life Changing",
    emoji: "✨",
    description: "The Traveler found this unforgettable.",
    earned: true,
    count: 1,
    awards: [],
  },
  {
    badgeType: "tasty",
    name: "Tasty",
    emoji: "🍜",
    description: "The Traveler liked the food.",
    earned: true,
    count: 3,
    awards: [],
  },
  {
    badgeType: "wayfinder",
    name: "Wayfinder",
    emoji: "🧭",
    description: "A smart navigation call.",
    earned: false,
    count: 0,
    awards: [],
  },
  {
    badgeType: "photo_worthy",
    name: "Photo Worthy",
    emoji: "📸",
    description: "A view worth saving.",
    earned: false,
    count: 0,
    awards: [],
  },
];

/** @tag ai-generated */
export const Mixed: Story = {
  args: {
    badges,
    onSelect: () => {},
  },
};

/** @tag ai-generated */
export const AllLocked: Story = {
  args: {
    badges: badges.map((badge) => ({
      ...badge,
      earned: false,
      count: 0,
    })),
    onSelect: () => {},
  },
};

/** @tag ai-generated */
export const RepeatedEarned: Story = {
  args: {
    badges: badges.map((badge) => ({
      ...badge,
      earned: true,
      count: badge.badgeType === "tasty" ? 8 : 1,
    })),
    onSelect: () => {},
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";

import { tripcastApi } from "../../convex/tripcastApi";
import type {
  AchievementEvent,
  BadgeBoard,
  BadgeDefinition,
  ScoreSummary,
} from "../../convex/tripcastApi";
import AchievementsSheet from "./AchievementsSheet";

const meta = {
  title: "Achievements/AchievementsSheet",
  component: AchievementsSheet,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AchievementsSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

function event(overrides: Partial<AchievementEvent>): AchievementEvent {
  return {
    _id: overrides._id ?? "event-1",
    _creationTime: Date.UTC(2026, 4, 31),
    isDev: false,
    eventType: "daily_visit",
    points: 1,
    uniqueKey: "daily_visit:demo:2026-05-31",
    sourceType: "visit",
    title: "+1 Daily Visit",
    message: "You checked in today.",
    createdAt: Date.UTC(2026, 4, 31),
    ...overrides,
  };
}

const recent: AchievementEvent[] = [
  event({
    _id: "event-1",
    title: "+1 Daily Visit",
    message: "You checked in today.",
    points: 1,
    createdAt: Date.UTC(2026, 4, 31),
  }),
  event({
    _id: "event-2",
    eventType: "mission_completed",
    sourceType: "mission",
    title: "+5 Completed Mission",
    message: "City Tour exploration.",
    points: 5,
    createdAt: Date.UTC(2026, 4, 30),
  }),
  event({
    _id: "event-3",
    eventType: "badge_awarded",
    sourceType: "story",
    badgeType: "photo_worthy",
    title: "+10 Achievement Unlocked",
    message: "First Trip completed.",
    points: 10,
    createdAt: Date.UTC(2026, 4, 30),
  }),
];

const summary: ScoreSummary = {
  total: 125,
  count: 9,
  isDev: false,
  unseenCount: 0,
  recent,
};

const board: BadgeBoard = {
  isDev: false,
  badges: [
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
      count: 2,
      awards: [],
    },
    {
      badgeType: "photo_worthy",
      name: "Photo Worthy",
      emoji: "📸",
      description: "A view worth saving.",
      earned: true,
      count: 1,
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
      badgeType: "budget_saver",
      name: "Budget Saver",
      emoji: "💸",
      description: "Helped the Traveler save money.",
      earned: false,
      count: 0,
      awards: [],
    },
    {
      badgeType: "local_legend",
      name: "Local Legend",
      emoji: "🗺️",
      description: "Shared a local gem.",
      earned: false,
      count: 0,
      awards: [],
    },
  ],
};

const catalog: BadgeDefinition[] = board.badges.map(
  ({ badgeType, name, emoji, description }) => ({
    badgeType,
    name,
    emoji,
    description,
  }),
);

function storyMocks({
  badgeBoard = board,
  definitions = catalog,
  history = recent,
}: {
  badgeBoard?: BadgeBoard | undefined;
  definitions?: BadgeDefinition[];
  history?: AchievementEvent[];
} = {}) {
  return {
    queries: [
      { query: tripcastApi.badges.getMyBadges, result: badgeBoard },
      { query: tripcastApi.badges.listBadgeDefinitions, result: definitions },
      { query: tripcastApi.scoring.listAchievementHistory, result: history },
    ],
  };
}

const baseArgs = {
  open: true,
  summary,
  token: "storybook-token",
  onOpenChange: () => {},
};

/** @tag ai-generated */
export const Default: Story = {
  args: baseArgs,
  parameters: {
    convexMocks: storyMocks(),
  },
};

/** @tag ai-generated */
export const Empty: Story = {
  args: {
    ...baseArgs,
    summary: {
      total: 0,
      count: 0,
      isDev: false,
      unseenCount: 0,
      recent: [],
    },
  },
  parameters: {
    convexMocks: storyMocks({
      badgeBoard: {
        isDev: false,
        badges: board.badges.map((badge) => ({
          ...badge,
          earned: false,
          count: 0,
        })),
      },
      history: [],
    }),
  },
};

/** @tag ai-generated */
export const CatalogFallback: Story = {
  args: {
    ...baseArgs,
    summary: null,
  },
  parameters: {
    convexMocks: storyMocks({
      badgeBoard: undefined,
      history: [],
    }),
  },
};

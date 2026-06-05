import type { Meta, StoryObj } from "@storybook/react-vite";
import StoryDetailSheet from "./StoryDetailSheet";
import { FAKE_STORY } from "../../stories/fixtures/tripcast";
import { tripcastApi } from "../../convex/tripcastApi";

const meta = {
  title: "Journal/StoryDetailSheet",
  component: StoryDetailSheet,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    onClose: { action: "closed" },
    onLocationFocus: { action: "locationFocus" },
  },
} satisfies Meta<typeof StoryDetailSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const REACTIONS_MIXED = {
  entries: [{ emoji: "❤️", count: 5 }, { emoji: "👍", count: 2 }, { emoji: "😹", count: 1 }],
  myReaction: "❤️",
};

/** @tag ai-generated */
export const Narrative: Story = {
  args: {
    event: { ...FAKE_STORY, reactions: REACTIONS_MIXED } as any,
    role: "traveler",
    token: "mock-token",
    onClose: () => {},
    onLocationFocus: () => {},
  },
  parameters: {
    convexMocks: {
      queries: [
        {
          query: tripcastApi.checkpoints.getStoryImageUrl,
          result: "https://picsum.photos/seed/tripcast/800/600",
        },
        {
          query: tripcastApi.attributions.listAttributionsForSource,
          result: { attributions: [], publicCopy: "42 views" },
        },
      ],
    },
  },
};

/** @tag ai-generated */
export const Activity: Story = {
  args: {
    event: {
      ...FAKE_STORY,
      type: "story",
      _creationTime: Date.now(),
      narrativeLevel: "activity",
      title: "Quick Story",
      body: "Feeling good at the rest stop.",
      moodValue: "hopeful",
      energyLevel: "high",
      stomachLevel: "full",
      stressLevel: "calm",
      statusNote: "Sun is out!",
      reactions: { entries: [{ emoji: "👍", count: 3 }] },
    } as any,
    role: "traveler",
    token: "mock-token",
    onClose: () => {},
    onLocationFocus: () => {},
  },
};

/** @tag ai-generated */
export const FollowerView: Story = {
  args: {
    event: { ...FAKE_STORY, reactions: REACTIONS_MIXED } as any,
    role: "follower",
    token: "mock-token",
    onClose: () => {},
    onLocationFocus: () => {},
  },
};

/**
 * Stress test for header wrap behavior: long location text + all 6 emoji presets
 * with high counts. Use to verify the date · location · reactions row wraps
 * naturally only when content overflows.
 * @tag ai-generated
 */
export const HeaderWrapStress: Story = {
  args: {
    event: {
      ...FAKE_STORY,
      title: "A Night in the Desert Under the Milky Way",
      locationLabel: "Joshua Tree National Park, Mojave Desert, California",
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
    } as any,
    role: "traveler",
    token: "mock-token",
    onClose: () => {},
    onLocationFocus: () => {},
  },
};

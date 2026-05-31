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

/** @tag ai-generated */
export const Narrative: Story = {
  args: {
    event: FAKE_STORY as any,
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
    event: FAKE_STORY as any,
    role: "follower",
    token: "mock-token",
    onClose: () => {},
    onLocationFocus: () => {},
  },
};

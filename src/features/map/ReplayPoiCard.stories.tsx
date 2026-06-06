import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReplayPoiCard } from "./ReplayPoiCard";

const SAMPLE_IMAGE = "https://picsum.photos/seed/tripcast-replay/320/240";

const meta = {
  title: "Map/ReplayPoiCard",
  component: ReplayPoiCard,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ padding: 48, background: "var(--bg-paper-2)", borderRadius: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReplayPoiCard>;
export default meta;

/** @tag ai-generated */
export const PhotoWithNote: StoryObj<typeof meta> = {
  args: {
    imageUrl: SAMPLE_IMAGE,
    title: "Queen Anne Viewpoint",
    note: "A historical landmark with sweeping city views over the bay.",
    tilt: -2,
  },
};

/** @tag ai-generated */
export const PhotoTitleOnly: StoryObj<typeof meta> = {
  args: {
    imageUrl: SAMPLE_IMAGE,
    title: "Pike Place Market",
    tilt: 1.5,
  },
};

/** @tag ai-generated */
export const TextOnly: StoryObj<typeof meta> = {
  args: {
    title: "Morning coffee stop",
    note: "Quick espresso before the climb.",
  },
};

/** @tag ai-generated */
export const LongNoteClamped: StoryObj<typeof meta> = {
  args: {
    imageUrl: SAMPLE_IMAGE,
    title: "Discovery Park Loop",
    note:
      "We wandered the full perimeter trail past the lighthouse, down to the beach, and " +
      "back up through the meadow — far more walking than planned, but the views were worth " +
      "every step and we found a quiet bench to rest.",
    tilt: 2,
  },
};

/**
 * High replay speed: slide in/out durations are scaled down (via `transitionScale`)
 * so the card still plays fully inside the shorter checkpoint dwell. Re-mount the
 * story (Storybook's remount) to see the faster slide-in.
 * @tag ai-generated
 */
export const FastTransition: StoryObj<typeof meta> = {
  args: {
    imageUrl: SAMPLE_IMAGE,
    title: "Kerry Park (10x)",
    note: "Snappy slide-in/out tuned for fast replay.",
    tilt: -1,
    transitionScale: 0.25,
  },
};

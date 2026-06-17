import type { Meta, StoryObj } from "@storybook/react-vite";

import AddCheckpointSheet from "./AddCheckpointSheet";

const meta = {
  title: "Map/AddCheckpointSheet",
  component: AddCheckpointSheet,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    onClose: { action: "closed" },
    onBack: { action: "back" },
    onCheckpointCreated: { action: "checkpointCreated" },
  },
} satisfies Meta<typeof AddCheckpointSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const selectedCoordinate = {
  lat: 47.6097,
  lon: -122.3422,
  source: "tap_add_mode" as const,
};

/** @tag ai-generated */
export const AddPin: Story = {
  args: {
    selectedCoordinate,
    onSave: async () => "checkpoint-storybook",
    onClose: () => {},
    onUploadImage: async () => ({ storageId: "story-image-storybook" }),
    debugSource: {
      source: "storybook:add-pin",
      sourceLabel: "Storybook -> Add Pin",
    },
  },
};

/** @tag ai-generated */
export const WithPhotoMetadata: Story = {
  args: {
    selectedCoordinate,
    prefillFile: new File([""], "test.jpg", { type: "image/jpeg" }),
    onSave: async () => "checkpoint-with-photo",
    onClose: () => {},
    onUploadImage: async () => ({ storageId: "story-image-storybook" }),
  },
};

/** @tag ai-generated */
export const CompleteMissionAsStory: Story = {
  args: {
    selectedCoordinate,
    prefill: {
      title: "Ramen mission complete",
      note: "Found the tiny counter spot and ordered the house special.",
      locationLabel: "Capitol Hill",
      missionId: "mission-storybook",
      completeMission: true,
    },
    onSave: async () => "mission-story-checkpoint",
    onClose: () => {},
    onBack: () => {},
    onUploadImage: async () => ({ storageId: "story-image-storybook" }),
    stateSection: (
      <div className="rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--ink-2)]">
        Feeling good · Energy high · Stress calm
      </div>
    ),
    debugSource: {
      source: "storybook:complete-mission",
      sourceLabel: "Storybook -> Complete Mission",
    },
  },
};

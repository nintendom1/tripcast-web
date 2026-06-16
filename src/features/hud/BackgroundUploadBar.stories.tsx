import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { BackgroundUploadBarView } from "./BackgroundUploadBar";
import { PendingSave } from "../../lib/idb";

function makeSave(overrides: Partial<PendingSave> = {}): PendingSave {
  return {
    id: "story-save-1",
    data: {
      title: "Sunset over the trail",
      showInStory: true,
      lat: 0,
      lon: 0,
      imageSize: "medium",
      source: "manual",
    },
    status: "uploading",
    progress: 50,
    createdAt: Date.now(),
    retryCount: 0,
    ...overrides,
  };
}

const meta = {
  title: "HUD/BackgroundUploadBar",
  component: BackgroundUploadBarView,
  parameters: {
    layout: "centered",
    viewport: {
      viewports: {
        mobile: { name: "Mobile (390x844)", styles: { width: "390px", height: "844px" } },
      },
      defaultViewport: "mobile",
    },
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-[120px] items-center justify-center bg-[var(--bg-paper)] p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BackgroundUploadBarView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Uploading10: Story = {
  args: {
    currentSave: makeSave({ status: "uploading", progress: 10 }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/uploading photo/i)).toBeInTheDocument();
    await expect(canvasElement.querySelector("[data-bg-upload-bar]")).toBeTruthy();
  },
};

export const Uploading50: Story = {
  args: {
    currentSave: makeSave({ status: "uploading", progress: 50 }),
  },
};

export const Uploading80: Story = {
  args: {
    currentSave: makeSave({ status: "uploading", progress: 80 }),
  },
};

export const Saving: Story = {
  args: {
    currentSave: makeSave({ status: "saving", progress: 80 }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/saving pin/i)).toBeInTheDocument();
  },
};

export const MultiSave: Story = {
  args: {
    currentSave: makeSave({ status: "uploading", progress: 35 }),
    extraCount: 2,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/\+2 more/i)).toBeInTheDocument();
  },
};

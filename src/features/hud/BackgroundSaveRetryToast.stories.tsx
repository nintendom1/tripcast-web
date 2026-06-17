import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { fn } from "storybook/test";
import { BackgroundSaveRetryToastView } from "./BackgroundSaveRetryToast";
import { PendingSave } from "../../lib/idb";

function makeSave(overrides: Partial<PendingSave> = {}): PendingSave {
  return {
    id: "story-failed-save",
    data: {
      title: "Lookout point",
      showInStory: true,
      lat: 0,
      lon: 0,
      imageSize: "medium",
      source: "manual",
    },
    status: "failed",
    progress: 0,
    createdAt: Date.now(),
    retryCount: 1,
    ...overrides,
  };
}

const meta = {
  title: "HUD/BackgroundSaveRetryToast",
  component: BackgroundSaveRetryToastView,
  args: {
    onRetry: fn(),
    onDismiss: fn(),
    onRetryLinkFailed: fn(),
  },
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
      <div className="flex min-h-[160px] w-[420px] items-center justify-center bg-[var(--bg-paper)] p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BackgroundSaveRetryToastView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Failed: Story = {
  args: {
    save: makeSave({
      status: "failed",
      error: "Network request failed",
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/save failed/i)).toBeInTheDocument();
    await expect(await canvas.findByText(/network request failed/i)).toBeInTheDocument();
    const retry = await canvas.findByRole("button", { name: /^retry$/i });
    await expect(retry).toBeEnabled();
  },
};

export const LinkFailed: Story = {
  args: {
    save: makeSave({
      status: "link-failed",
      checkpointId: "ckp_abc123",
      linkStatus: "failed",
      error: "Pin saved, but spend tracking failed — tap Retry to relink.",
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Spend Tracking Failed")).toBeInTheDocument();
    await expect(await canvas.findByText(/tap retry to relink/i)).toBeInTheDocument();
  },
};

export const BackoffActive: Story = {
  args: {
    save: makeSave({
      status: "failed",
      error: "Upload timed out",
      retryCount: 3,
      nextRetryAt: Date.now() + 8_000,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const retry = await canvas.findByRole("button", { name: /retry in \d+s/i });
    await expect(retry).toBeDisabled();
  },
};

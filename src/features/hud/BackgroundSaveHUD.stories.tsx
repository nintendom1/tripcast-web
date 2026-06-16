import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { fn } from "storybook/test";
import { BackgroundUploadBarView } from "./BackgroundUploadBar";
import { BackgroundSaveRetryToastView } from "./BackgroundSaveRetryToast";
import { Dock } from "./Dock";
import { PendingSave } from "../../lib/idb";

function makeSave(overrides: Partial<PendingSave> = {}): PendingSave {
  return {
    id: "story-hud-save",
    data: {
      title: "Trailhead",
      showInStory: true,
      lat: 0,
      lon: 0,
      imageSize: "medium",
      source: "manual",
    },
    status: "uploading",
    progress: 40,
    createdAt: Date.now(),
    retryCount: 0,
    ...overrides,
  };
}

function MapShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[var(--bg-paper)]">
      <div
        className="absolute inset-0 bg-gradient-to-b from-[var(--bg-paper)] to-[var(--bg-canvas)]"
        aria-hidden
      />
      {children}
    </div>
  );
}

const meta = {
  title: "HUD/BackgroundSaveHUD",
  parameters: {
    layout: "fullscreen",
    viewport: {
      viewports: {
        mobile: { name: "Mobile (390x844)", styles: { width: "390px", height: "844px" } },
      },
      defaultViewport: "mobile",
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const UploadBarAboveDock: Story = {
  render: () => (
    <MapShell>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex flex-col items-center gap-3 pb-2">
        <BackgroundUploadBarView
          currentSave={makeSave({ status: "uploading", progress: 45 })}
        />
        <Dock active={null} onSelect={() => {}} onAdd={() => {}} />
      </div>
    </MapShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/uploading photo/i)).toBeInTheDocument();
    await expect(canvasElement.querySelector("[data-bg-upload-bar]")).toBeTruthy();
  },
};

export const RetryToastAboveDock: Story = {
  render: () => (
    <MapShell>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex flex-col items-center gap-3 pb-2">
        <BackgroundSaveRetryToastView
          save={makeSave({ status: "failed", error: "Network request failed" })}
          onRetry={fn()}
          onDismiss={fn()}
          onRetryLinkFailed={fn()}
        />
        <Dock active={null} onSelect={() => {}} onAdd={() => {}} />
      </div>
    </MapShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/save failed/i)).toBeInTheDocument();
    await expect(canvasElement.querySelector("[data-bg-retry-toast]")).toBeTruthy();
  },
};

export const BarAndToastStacked: Story = {
  name: "Bar + Toast (rare concurrent case)",
  render: () => (
    <MapShell>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex flex-col items-center gap-3 pb-2">
        <BackgroundSaveRetryToastView
          save={makeSave({
            id: "failed-1",
            status: "link-failed",
            checkpointId: "ckp_xyz",
            error: "Pin saved, but spend tracking failed — tap Retry to relink.",
          })}
          onRetry={fn()}
          onDismiss={fn()}
          onRetryLinkFailed={fn()}
        />
        <BackgroundUploadBarView
          currentSave={makeSave({ id: "uploading-1", status: "uploading", progress: 60 })}
          extraCount={1}
        />
        <Dock active={null} onSelect={() => {}} onAdd={() => {}} />
      </div>
    </MapShell>
  ),
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { LiveGpsSettings } from "./LiveGpsSettings";

const meta = {
  title: "Options/LiveGpsSettings",
  component: LiveGpsSettings,
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-[var(--bg-paper)] p-4 text-[var(--ink-1)]">
        <div className="mx-auto max-w-xl">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: {
    viewport: {
      viewports: {
        mobile: { name: "Mobile (390x844)", styles: { width: "390px", height: "844px" } },
      },
      defaultViewport: "mobile",
    },
  },
} satisfies Meta<typeof LiveGpsSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  args: { previewAdaptiveEnabled: true, previewMode: "off", previewUploadIntervalSeconds: 15 },
};

export const Precise: Story = {
  args: { previewAdaptiveEnabled: true, previewMode: "precise", previewUploadIntervalSeconds: 15 },
};

export const PowerSaving: Story = {
  args: { previewAdaptiveEnabled: true, previewMode: "power-saving", previewUploadIntervalSeconds: 15 },
};

export const UploadImmediate: Story = {
  args: { previewAdaptiveEnabled: true, previewMode: "precise", previewUploadIntervalSeconds: 0 },
};

export const UploadEvery15Seconds: Story = {
  args: { previewAdaptiveEnabled: true, previewMode: "precise", previewUploadIntervalSeconds: 15 },
};

export const UploadEvery30Seconds: Story = {
  args: { previewAdaptiveEnabled: true, previewMode: "precise", previewUploadIntervalSeconds: 30 },
};

export const AlertsOff: Story = {
  args: {
    previewAdaptiveEnabled: true,
    previewMode: "precise",
    previewAlertThresholdSeconds: 0,
  },
};

export const Legacy: Story = {
  args: { previewAdaptiveEnabled: false, previewMode: "legacy" },
};

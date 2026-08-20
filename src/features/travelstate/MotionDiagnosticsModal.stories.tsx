import type { Meta, StoryObj } from "@storybook/react-vite";

import MotionDiagnosticsModal from "./MotionDiagnosticsModal";

const meta = {
  title: "TravelState/MotionDiagnosticsModal",
  component: MotionDiagnosticsModal,
  decorators: [
    (Story) => (
      <div className="relative min-h-[844px] overflow-hidden bg-[var(--bg-paper)] text-[var(--ink-1)]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MotionDiagnosticsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @tag ai-generated */
export const VehicleAcknowledged: Story = {
  args: {
    onClose: () => {},
    previewState: {
      classification: "automotive",
      confidence: "high",
      changedAt: Date.now() - 90_000,
      publishStatus: "acknowledged",
      pendingClassification: null,
      publishFailureReason: null,
    },
  },
};

/** @tag ai-generated */
export const CyclingOffline: Story = {
  args: {
    onClose: () => {},
    previewState: {
      classification: "cycling",
      confidence: "medium",
      changedAt: Date.now() - 15_000,
      publishStatus: "failed",
      pendingClassification: "cycling",
      publishFailureReason: "network",
    },
  },
};

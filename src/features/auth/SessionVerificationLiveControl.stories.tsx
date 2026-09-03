import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { SessionVerificationLiveControl } from "./SessionVerificationLiveControl";
import { PendingBreadcrumbPauseDialog } from "../hud/PendingBreadcrumbPauseDialog";

const meta = {
  title: "Auth/SessionVerificationLiveControl",
  component: SessionVerificationLiveControl,
  args: {
    live: false,
    phase: "idle",
    liveTrailEnabled: true,
    onToggle: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--bg-canvas)] p-4">
        <div className="w-full max-w-sm">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof SessionVerificationLiveControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Paused: Story = {};
export const Starting: Story = { args: { live: true, phase: "starting" } };
export const Live: Story = {
  args: { live: true, phase: "active", trackingMode: "precise" },
};
export const PowerSaving: Story = {
  args: { live: true, phase: "active", trackingMode: "power-saving" },
};
export const Legacy: Story = {
  args: { live: true, phase: "active", trackingMode: "legacy" },
};
export const OfflineQueued: Story = {
  args: {
    live: true,
    phase: "active",
    trackingMode: "precise",
    publishingPhase: "offline",
    pendingBreadcrumbs: 37,
  },
};
export const Syncing: Story = {
  args: {
    live: true,
    phase: "active",
    trackingMode: "precise",
    publishingPhase: "syncing",
    pendingBreadcrumbs: 21,
  },
};
export const LiveTrailPaused: Story = {
  args: { live: true, phase: "active", trackingMode: "legacy", liveTrailEnabled: false },
};
export const Degraded: Story = { args: { live: true, phase: "degraded" } };
export const ConfigurationUnavailable: Story = {
  args: { live: true, phase: "configuration-missing", liveTrailEnabled: null },
};

function PauseConfirmationFixture() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SessionVerificationLiveControl
        live
        phase="active"
        trackingMode="legacy"
        publishingPhase="offline"
        pendingBreadcrumbs={37}
        liveTrailEnabled
        onToggle={() => setOpen(true)}
      />
      <PendingBreadcrumbPauseDialog
        open={open}
        breadcrumbCount={37}
        onOpenChange={setOpen}
        onKeep={() => setOpen(false)}
        onDiscard={() => setOpen(false)}
      />
    </>
  );
}

export const PauseConfirmation: Story = {
  render: () => <PauseConfirmationFixture />,
};

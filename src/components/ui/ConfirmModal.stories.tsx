import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { ConfirmModal } from "./ConfirmModal";

const meta = {
  title: "UI/ConfirmModal",
  component: ConfirmModal,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    onConfirm: { action: "confirmed" },
  },
} satisfies Meta<typeof ConfirmModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The current-vs-photo comparison block used when applying image metadata to a
 * checkpoint. Mirrors the layout rendered by AddCheckpointSheet.
 */
function Comparison({ current, photo }: { current: string; photo: string }) {
  return (
    <div className="space-y-3">
      <p>Use the metadata from the photo instead of the current value?</p>
      <div className="grid grid-cols-2 gap-4 rounded-lg bg-[var(--bg-paper-2)] p-3 text-xs">
        <div className="space-y-1">
          <span className="font-bold uppercase tracking-wider text-[var(--ink-3)]">Current</span>
          <div className="font-mono text-[var(--ink-1)]">{current}</div>
        </div>
        <div className="space-y-1">
          <span className="font-bold uppercase tracking-wider text-[var(--flag)]">Photo</span>
          <div className="font-mono text-[var(--ink-1)]">{photo}</div>
        </div>
      </div>
    </div>
  );
}

/** @tag ai-generated */
export const GpsComparison: Story = {
  args: {
    open: true,
    title: "Update location?",
    confirmLabel: "Update",
    description: <Comparison current="47.609700, -122.342200" photo="-33.868800, 151.209300" />,
    onOpenChange: () => {},
    onConfirm: () => {},
  },
  render: (args) => {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button
          type="button"
          className="rounded-full bg-[var(--flag)] px-4 py-2 text-sm font-semibold text-[var(--bg-paper)]"
          onClick={() => setOpen(true)}
        >
          Open confirm modal
        </button>
        <ConfirmModal {...args} open={open} onOpenChange={setOpen} />
      </>
    );
  },
};

/** @tag ai-generated */
export const DateComparison: Story = {
  args: {
    open: true,
    title: "Update date/time?",
    confirmLabel: "Update",
    description: <Comparison current="2026-06-18T09:30" photo="2026-01-01T12:00" />,
    onOpenChange: () => {},
    onConfirm: () => {},
  },
  render: GpsComparison.render,
};

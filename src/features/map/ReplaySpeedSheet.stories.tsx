import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import ReplaySpeedSheet from "./ReplaySpeedSheet";

const SPEED_OPTIONS = [0.5, 1, 2, 5, 10, 20, 30] as const;

const meta = {
  title: "Map/ReplaySpeedSheet",
  component: ReplaySpeedSheet,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof ReplaySpeedSheet>;
export default meta;

/** @tag ai-generated */
export const Default: StoryObj = {
  render: () => {
    const [open, setOpen] = useState(true);
    const [speed, setSpeed] = useState(1);
    return (
      <div className="h-[480px]">
        <button
          type="button"
          className="m-4 rounded-full bg-[var(--flag)] px-4 py-2 text-sm font-semibold text-[var(--ink-on-brand)]"
          onClick={() => setOpen(true)}
        >
          Open speed sheet (current: {speed}x)
        </button>
        <ReplaySpeedSheet
          open={open}
          speed={speed}
          options={SPEED_OPTIONS}
          onSelect={(next) => {
            setSpeed(next);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      </div>
    );
  },
};

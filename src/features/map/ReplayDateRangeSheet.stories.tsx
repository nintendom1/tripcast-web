import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import ReplayDateRangeSheet from "./ReplayDateRangeSheet";

const DAY = 86_400_000;
const NOW = Date.UTC(2024, 4, 31, 12, 0, 0); // stable for visual snapshots
const BOUNDS = { min: NOW - 30 * DAY, max: NOW };

const meta = {
  title: "Map/ReplayDateRangeSheet",
  component: ReplayDateRangeSheet,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof ReplayDateRangeSheet>;
export default meta;

/** @tag ai-generated */
export const Default: StoryObj = {
  render: () => {
    const [open, setOpen] = useState(true);
    const [window, setWindow] = useState<{ startAt: number; endAt: number } | null>(null);
    return (
      <div className="h-[560px]">
        <button
          type="button"
          className="m-4 rounded-full bg-[var(--flag)] px-4 py-2 text-sm font-semibold text-[var(--ink-on-brand)]"
          onClick={() => setOpen(true)}
        >
          Open date sheet ({window ? "windowed" : "full trip"})
        </button>
        <ReplayDateRangeSheet
          open={open}
          bounds={BOUNDS}
          window={window}
          onApply={(startAt, endAt) => {
            setWindow({ startAt, endAt });
            setOpen(false);
          }}
          onReset={() => {
            setWindow(null);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      </div>
    );
  },
};

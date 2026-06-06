import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { DualRangeSlider } from "./DualRangeSlider";

const meta = {
  title: "UI/DualRangeSlider",
  component: DualRangeSlider,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof DualRangeSlider>;
export default meta;

/** @tag ai-generated */
export const Default: StoryObj = {
  render: () => {
    const [value, setValue] = useState({ start: 25, end: 75 });
    return (
      <div className="w-80">
        <DualRangeSlider min={0} max={100} value={value} onChange={setValue} />
        <p className="mt-3 text-center text-sm text-[var(--ink-2)]">
          {value.start} – {value.end}
        </p>
      </div>
    );
  },
};

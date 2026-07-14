import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import ReplayStartSheet from "./ReplayStartSheet";

const meta = {
  title: "Map/ReplayStartSheet",
  component: ReplayStartSheet,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof ReplayStartSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithResume: Story = {
  args: { open: true, hasResume: true, onSelect: () => {}, onClose: () => {} },
  render: () => {
    const [open, setOpen] = useState(true);
    return <div className="h-[560px]"><ReplayStartSheet open={open} hasResume onSelect={() => setOpen(false)} onClose={() => setOpen(false)} /></div>;
  },
};

export const WithoutResume: Story = {
  args: { open: true, hasResume: false, onSelect: () => {}, onClose: () => {} },
};

export const Loading: Story = {
  args: { open: true, hasResume: true, loading: true, onSelect: () => {}, onClose: () => {} },
};

export const Failed: Story = {
  args: { open: true, hasResume: true, error: "Replay functions are not available on the connected backend.", onSelect: () => {}, onClose: () => {} },
};

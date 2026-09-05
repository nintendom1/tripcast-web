import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SnoozeLiveSheet } from "./SnoozeLiveSheet";

const TODAY = new Date(2030, 4, 20, 10, 0);

const meta = {
  title: "HUD/SnoozeLiveSheet",
  component: SnoozeLiveSheet,
  args: {
    open: true,
    now: TODAY,
    onOpenChange: fn(),
    onConfirm: fn(),
    onCancelSnooze: fn(),
  },
  parameters: {
    viewport: {
      viewports: {
        mobile: { name: "Mobile (390x844)", styles: { width: "390px", height: "844px" } },
      },
      defaultViewport: "mobile",
    },
  },
  decorators: [
    (Story) => (
      <div className="relative min-h-dvh bg-[var(--bg-canvas)]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SnoozeLiveSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NewSnooze: Story = {};

export const EditSnooze: Story = {
  args: {
    snoozedUntil: new Date(2030, 4, 20, 13, 45).getTime(),
  },
};

function TomorrowFixture() {
  const [open, setOpen] = useState(true);
  return (
    <SnoozeLiveSheet
      open={open}
      now={new Date(2030, 4, 20, 23, 45)}
      onOpenChange={setOpen}
      onConfirm={fn()}
    />
  );
}

export const Tomorrow: Story = {
  render: () => <TomorrowFixture />,
};

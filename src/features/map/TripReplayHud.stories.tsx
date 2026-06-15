import type { Meta, StoryObj } from "@storybook/react";
import { TripReplayHud } from "./TripMap";

const meta: Meta<typeof TripReplayHud> = {
  title: "Features/Map/TripReplayHud",
  component: TripReplayHud,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="relative h-[400px] w-[500px] bg-slate-200 p-4 overflow-hidden">
        <Story />
      </div>
    ),
  ],
  args: {
    playheadIndex: 10,
    endIndex: 100,
    currentPinKind: "breadcrumb",
    currentPinTime: 1718400000000,
    speed: 1,
    windowLabel: "Full trip",
    isPaused: true,
    onTogglePause: () => {},
    onRestart: () => {},
    onNext: () => {},
    onPrevious: () => {},
    onScrub: () => {},
    onOpenSpeedSheet: () => {},
    onOpenDateSheet: () => {},
    onClose: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof TripReplayHud>;

export const Default: Story = {};

export const Paused: Story = {
  args: {
    isPaused: true,
  },
};

export const Playing: Story = {
  args: {
    isPaused: false,
  },
};

export const EndOfReplay: Story = {
  args: {
    currentPinKind: "end",
    playheadIndex: 100,
  },
};

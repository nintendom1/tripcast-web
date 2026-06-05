import type { Meta, StoryObj } from "@storybook/react-vite";
import { TripReplayHud } from "./TripMap";

const meta: Meta<typeof TripReplayHud> = {
  title: "Features/Map/TripReplayHud",
  component: TripReplayHud,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs", "ai-generated"],
  argTypes: {
    onRangeChange: { action: "rangeChanged" },
    onTogglePause: { action: "togglePaused" },
    onRestart: { action: "restarted" },
    onScrub: { action: "scrubbed" },
    onSpeedChange: { action: "speedChanged" },
    onShuttleStart: { action: "shuttleStarted" },
    onShuttleEnd: { action: "shuttleEnded" },
    onClose: { action: "closed" },
  },
  decorators: [
    (Story) => (
      <div className="relative h-[600px] w-[400px] border border-dashed border-zinc-500 bg-zinc-100 dark:bg-zinc-900">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TripReplayHud>;

export const Default: Story = {
  args: {
    playheadIndex: 5,
    startIndex: 0,
    endIndex: 20,
    totalIndex: 20,
    currentPinKind: "breadcrumb",
    currentPinTime: Date.now(),
    speed: 1,
    isPaused: false,
    range: [0, 20],
    onRangeChange: () => {},
    onTogglePause: () => {},
    onRestart: () => {},
    onScrub: () => {},
    onSpeedChange: () => {},
    onShuttleStart: () => {},
    onShuttleEnd: () => {},
    onClose: () => {},
  },
};

export const FilteredRange: Story = {
  args: {
    ...Default.args,
    playheadIndex: 10,
    startIndex: 5,
    endIndex: 15,
    range: [5, 15],
  },
};

export const Paused: Story = {
  args: {
    ...Default.args,
    isPaused: true,
  },
};

export const HighSpeed: Story = {
  args: {
    ...Default.args,
    speed: 8,
  },
};

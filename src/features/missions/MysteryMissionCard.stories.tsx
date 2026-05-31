import type { Meta, StoryObj } from "@storybook/react-vite";
import MysteryMissionCard from "./MysteryMissionCard";
import type { MysteryMissionFeedItem } from "../../convex/tripcastApi";

const signal: MysteryMissionFeedItem = {
  kind: "mystery_mission",
  _id: "mystery-1",
  mysteryMissionId: "kyoto-fushimi-001",
  state: "signal",
  lat: 34.9671,
  lon: 135.7727,
  region: "Kyoto",
  mysteryText: "ReD PAth",
  spawnRadiusMiles: 30,
  priority: 3,
  tags: ["japan", "kyoto", "shrine"],
  estimatedVisitMinutes: 45,
  distanceMiles: 2.4,
};

const revealed: MysteryMissionFeedItem = {
  ...signal,
  _id: "mystery-2",
  state: "revealed",
  trueIntent: "Fushimi Inari is known for its thousands of vermilion torii gates.",
  locationName: "Fushimi Inari Taisha",
  completedAt: Date.now(),
};

const meta = {
  title: "Missions/MysteryMissionCard",
  component: MysteryMissionCard,
  decorators: [
    (Story) => (
      <div className="max-w-md bg-[var(--bg-paper)] p-4">
        <Story />
      </div>
    ),
  ],
  args: { mission: signal },
} satisfies Meta<typeof MysteryMissionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Signal: Story = {};

export const HighlightedSignal: Story = {
  args: { isHighlighted: true },
};

export const Revealed: Story = {
  args: { mission: revealed },
};

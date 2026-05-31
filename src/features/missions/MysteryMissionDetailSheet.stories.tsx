import type { Meta, StoryObj } from "@storybook/react-vite";
import MysteryMissionDetailSheet from "./MysteryMissionDetailSheet";
import { tripcastApi, type MysteryMissionFeedItem } from "../../convex/tripcastApi";

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
};

const meta = {
  title: "Missions/MysteryMissionDetailSheet",
  component: MysteryMissionDetailSheet,
  decorators: [
    (Story) => (
      <div className="max-w-md bg-[var(--bg-paper)] p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    mission: signal,
    token: "t",
    role: "traveler",
    onClose: () => {},
    onCompleteAsStory: () => {},
  },
  parameters: {
    convexMocks: {
      queries: [
        { query: tripcastApi.mysteryMissions.getMysteryMission, result: signal },
      ],
      mutations: [
        { mutation: tripcastApi.mysteryMissions.travelerCompleteMysteryMission, result: null },
        { mutation: tripcastApi.mysteryMissions.travelerDismissMysteryMission, result: null },
      ],
    },
  },
} satisfies Meta<typeof MysteryMissionDetailSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Signal: Story = {};

export const Revealed: Story = {
  args: {
    mission: {
      ...signal,
      state: "revealed",
      trueIntent: "Fushimi Inari is known for its thousands of vermilion torii gates.",
      locationName: "Fushimi Inari Taisha",
      completedAt: Date.now(),
    },
  },
  parameters: {
    convexMocks: {
      queries: [
        {
          query: tripcastApi.mysteryMissions.getMysteryMission,
          result: {
            ...signal,
            state: "revealed",
            trueIntent: "Fushimi Inari is known for its thousands of vermilion torii gates.",
            locationName: "Fushimi Inari Taisha",
            completedAt: Date.now(),
          },
        },
      ],
    },
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import MissionDetailSheet from "./MissionDetailSheet";
import { tripcastApi, type Mission } from "../../convex/tripcastApi";

const NOW = Date.now();

const BASE_MISSION: Mission = {
  _id: "m1",
  title: "Reach the Summit",
  description: "Climb to the top of the ridge for a view of the valley.",
  status: "visible",
  source: "traveler",
  locationLabel: "Ridge Viewpoint",
  lat: 47.8,
  lon: -121.7,
  estimatedDurationMinutes: 45,
  estimatedCostUsd: 0,
  estimatedEnergyImpact: "medium",
  acceptedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
  reactions: {
    entries: [{ emoji: "❤️", count: 4 }, { emoji: "👍", count: 2 }],
    myReaction: "👍",
  },
} as unknown as Mission;

const MYSTERY_MISSION: Mission = {
  _id: "m-mystery-1",
  title: "ReD PAth",
  description: undefined,
  status: "visible",
  source: "mystery",
  sourceMysteryMissionId: "mm-1",
  locationLabel: "Kyoto",
  lat: 34.9671,
  lon: 135.7727,
  estimatedDurationMinutes: 60,
  acceptedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
} as unknown as Mission;

const MYSTERY_RECORD_SIGNAL = {
  kind: "mystery_mission" as const,
  _id: "mm-1",
  mysteryMissionId: "kyoto-fushimi-001",
  state: "signal" as const,
  lat: 34.9671,
  lon: 135.7727,
  region: "Kyoto",
  mysteryText: "ReD PAth",
  spawnRadiusMiles: 30,
  priority: 3,
  tags: ["japan", "kyoto", "shrine"],
};

const MYSTERY_RECORD_REVEALED = {
  ...MYSTERY_RECORD_SIGNAL,
  state: "revealed" as const,
  trueIntent: "Fushimi Inari is known for its thousands of vermilion torii gates winding up the mountainside.",
  locationName: "Fushimi Inari Taisha",
  spoilerSummary: "Bring water; the hike to the top takes around 90 minutes round-trip.",
  completedAt: NOW,
};

const COMMON_QUERY_MOCKS = [
  { query: tripcastApi.currentActivity.travelerGetCurrentActivity, result: null },
  { query: tripcastApi.missions.travelerListMissions, result: [] },
  { query: tripcastApi.journalEvents.listJournalEvents, result: [] },
  { query: tripcastApi.attributions.listAttributionsForSource, result: { attributions: [], publicCopy: "" } },
  { query: tripcastApi.travelFunds.travelerGetConfig, result: { enabled: false } },
];

const meta = {
  title: "Missions/MissionDetailSheet",
  component: MissionDetailSheet,
  decorators: [
    (Story, ctx) => {
      const isMystery = (ctx.args.Mission as Mission | null)?.source === "mystery";
      return (
        <div className={isMystery ? "mystery-theme bg-[var(--bg-paper)] max-w-md" : "max-w-md bg-[var(--bg-paper)]"}>
          <Story />
        </div>
      );
    },
  ],
  args: {
    token: "t",
    role: "traveler",
    isOwn: true,
    onClose: () => {},
  },
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof MissionDetailSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @tag ai-generated */
export const VisibleTraveler: Story = {
  args: {
    Mission: BASE_MISSION,
  },
  parameters: {
    convexMocks: {
      queries: [
        { query: tripcastApi.missions.getMission, result: BASE_MISSION },
        ...COMMON_QUERY_MOCKS,
      ],
    },
  },
};

/** @tag ai-generated */
export const Completed: Story = {
  args: {
    Mission: { ...BASE_MISSION, status: "completed", completedAt: NOW } as Mission,
  },
  parameters: {
    convexMocks: {
      queries: [
        { query: tripcastApi.missions.getMission, result: { ...BASE_MISSION, status: "completed", completedAt: NOW } },
        ...COMMON_QUERY_MOCKS,
      ],
    },
  },
};

/** @tag ai-generated */
export const Dropped: Story = {
  args: {
    Mission: { ...BASE_MISSION, status: "dropped", droppedAt: NOW } as Mission,
  },
  parameters: {
    convexMocks: {
      queries: [
        { query: tripcastApi.missions.getMission, result: { ...BASE_MISSION, status: "dropped", droppedAt: NOW } },
        ...COMMON_QUERY_MOCKS,
      ],
    },
  },
};

/** @tag ai-generated */
export const MysteryUnlocked: Story = {
  args: {
    Mission: MYSTERY_MISSION,
  },
  parameters: {
    convexMocks: {
      queries: [
        { query: tripcastApi.missions.getMission, result: MYSTERY_MISSION },
        { query: tripcastApi.mysteryMissions.getMysteryMission, result: MYSTERY_RECORD_SIGNAL },
        ...COMMON_QUERY_MOCKS,
      ],
    },
  },
};

/** @tag ai-generated */
export const MysteryActive: Story = {
  args: {
    Mission: { ...MYSTERY_MISSION, status: "in_progress", startedAt: NOW } as Mission,
  },
  parameters: {
    convexMocks: {
      queries: [
        { query: tripcastApi.missions.getMission, result: { ...MYSTERY_MISSION, status: "in_progress", startedAt: NOW } },
        { query: tripcastApi.mysteryMissions.getMysteryMission, result: MYSTERY_RECORD_SIGNAL },
        ...COMMON_QUERY_MOCKS,
      ],
    },
  },
};

/** @tag ai-generated */
export const MysteryRevealed: Story = {
  args: {
    Mission: { ...MYSTERY_MISSION, status: "completed", completedAt: NOW } as Mission,
  },
  parameters: {
    convexMocks: {
      queries: [
        { query: tripcastApi.missions.getMission, result: { ...MYSTERY_MISSION, status: "completed", completedAt: NOW } },
        { query: tripcastApi.mysteryMissions.getMysteryMission, result: MYSTERY_RECORD_REVEALED },
        ...COMMON_QUERY_MOCKS,
      ],
    },
  },
};

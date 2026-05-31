import type { Meta, StoryObj } from "@storybook/react-vite";
import TravelerStateSheet from "./TravelerStateSheet";
import { tripcastApi } from "../../convex/tripcastApi";

const meta = {
  title: "TravelState/TravelerStateSheet",
  component: TravelerStateSheet,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    onClose: { action: "closed" },
    onToast: { action: "toast" },
  },
} satisfies Meta<typeof TravelerStateSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockState = {
  state: {
    moodValue: "happy",
    energyLevel: "high",
    energyScore: 85,
    stomachLevel: "full",
    stomachScore: 110,
    stressLevel: "low",
    stressScore: 20,
    schedulePressureLevel: "relaxed",
    statusNote: "Exploring the mountains!",
    statusEmoji: "🏔️",
    updatedAt: Date.now() - 3600000,
  },
  visibility: {
    showTravelerState: true,
    showTravelerClock: true,
    showMood: true,
    showEnergy: true,
    showStomach: true,
    showStress: true,
    showSchedulePressure: true,
    showStatusNote: true,
    showBiometrics: true,
    updatedAt: Date.now(),
  },
};

const mockAutoState = {
  autoStateEnabled: true,
  autoTimeZone: "America/Los_Angeles",
  autoBedtimeMinutes: 1320,
  autoWakeTimeMinutes: 480,
  autoEnergyMin: 10,
  autoEnergyMax: 90,
  autoStomachMin: 0,
  autoStomachMax: 150,
  autoEnabledAt: Date.now() - 86400000,
  autoBaseEnergyScore: 80,
  autoBaseStomachScore: 100,
};

const mockActivity = {
  title: "Hiking",
  emoji: "🥾",
  startedAt: Date.now() - 1800000,
};

const mockStaleness = {
  enabled: true,
  fallbackTitle: "Idle",
  fallbackEmoji: "🙂",
  resetAfterMs: 14400000,
};

const mockPrefs = {
  sleepHoursEnabled: true,
  sleepStartMinutes: 1320,
  sleepEndMinutes: 420,
  sleepStaleThresholdMs: 3600000,
};

/** @tag ai-generated */
export const Default: Story = {
  args: {
    token: "mock-token",
    onClose: () => {},
  },
  parameters: {
    convexMocks: {
      queries: [
        { query: tripcastApi.travelerState.travelerGetState, result: mockState },
        { query: tripcastApi.travelerAutoState.travelerGetAutoState, result: mockAutoState },
        { query: tripcastApi.currentActivity.travelerGetCurrentActivity, result: mockActivity },
        { query: tripcastApi.currentActivity.travelerGetStalenessSettings, result: mockStaleness },
        { query: tripcastApi.travelerPreferences.travelerGetPreferences, result: mockPrefs },
      ],
    },
  },
};

/** @tag ai-generated */
export const VisibilityTab: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    // We could use testing-library to click the Visibility tab
  }
};

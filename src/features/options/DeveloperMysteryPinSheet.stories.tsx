import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import {
  DEVELOPER_MYSTERY_SAMPLE,
  DeveloperMysteryPinContent,
} from "./DeveloperMysteryPinSheet";

const meta = {
  title: "Options/DeveloperMysteryPinSheet",
  component: DeveloperMysteryPinContent,
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-[var(--bg-paper)] text-[var(--ink-1)]">
        <div className="mx-auto max-w-xl">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: {
    viewport: {
      viewports: {
        mobile: { name: "Mobile (390x844)", styles: { width: "390px", height: "844px" } },
      },
      defaultViewport: "mobile",
    },
  },
  args: {
    mysteryText: "",
    trueIntent: "",
    onMysteryTextChange: fn(),
    onTrueIntentChange: fn(),
    onAutofill: fn(),
    onCreate: fn(),
    status: { type: "idle" },
    settingsEnabled: true,
    debugPinsEnabled: true,
  },
} satisfies Meta<typeof DeveloperMysteryPinContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Autofilled: Story = {
  args: {
    mysteryText: DEVELOPER_MYSTERY_SAMPLE.mysteryText,
    trueIntent: DEVELOPER_MYSTERY_SAMPLE.trueIntent,
  },
};

export const SetupRequired: Story = {
  args: {
    mysteryText: DEVELOPER_MYSTERY_SAMPLE.mysteryText,
    trueIntent: DEVELOPER_MYSTERY_SAMPLE.trueIntent,
    settingsEnabled: false,
    debugPinsEnabled: false,
  },
};

export const GettingLocation: Story = {
  args: {
    mysteryText: DEVELOPER_MYSTERY_SAMPLE.mysteryText,
    trueIntent: DEVELOPER_MYSTERY_SAMPLE.trueIntent,
    status: { type: "locating" },
  },
};

export const LocationError: Story = {
  args: {
    mysteryText: DEVELOPER_MYSTERY_SAMPLE.mysteryText,
    trueIntent: DEVELOPER_MYSTERY_SAMPLE.trueIntent,
    status: {
      type: "error",
      message: "Location permission was denied. Allow precise location access, then try again.",
    },
  },
};

export const CreatedLiveOff: Story = {
  args: {
    mysteryText: DEVELOPER_MYSTERY_SAMPLE.mysteryText,
    trueIntent: DEVELOPER_MYSTERY_SAMPLE.trueIntent,
    status: {
      type: "created",
      result: {
        mysteryMissionId: "mystery-test-id",
        linkedMissionId: "mission-test-id",
        lat: 36.28807,
        lon: 126.91933,
      },
      accuracyMeters: 8.4,
      liveEnabled: false,
    },
  },
};

export const CreatedLiveOn: Story = {
  args: {
    ...CreatedLiveOff.args,
    status: {
      type: "created",
      result: {
        mysteryMissionId: "mystery-test-id",
        linkedMissionId: "mission-test-id",
        lat: 36.28807,
        lon: 126.91933,
      },
      accuracyMeters: 8.4,
      liveEnabled: true,
    },
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import OptionsSheet from "./OptionsSheet";
import { MusicProvider } from "../../providers/MusicProvider";
import { ReadingSpeedProvider } from "../../providers/ReadingSpeedProvider";

/** @tag ai-generated */
const meta: Meta<typeof OptionsSheet> = {
  title: "Options/OptionsSheet",
  component: OptionsSheet,
  parameters: {
    layout: "fullscreen",
    convexMocks: {
      queries: {
        "travelerPreferences:travelerGetPreferences": {
          followerContentCutoffEnabled: false,
          travelerTimeZone: "America/Los_Angeles",
        },
        "missionSettings:travelerGetMissionSettings": {
          moderationMode: "manual_review",
          rateLimitPreset: "per_second",
        },
        "scoring:travelerGetScoringSettings": {
          developerScoringEnabled: false,
        },
        "attributions:getMyAttributionSettings": {
          showAttribution: true,
        },
        "liveTrail:travelerGetLiveTrailStatus": {
          enabled: false,
          visibleToFollowers: false,
        },
      },
    },
  },
  decorators: [
    (Story) => (
      <MusicProvider>
        <ReadingSpeedProvider>
          <div className="h-screen w-screen bg-gray-50">
            <Story />
          </div>
        </ReadingSpeedProvider>
      </MusicProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof OptionsSheet>;

export const Default: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    session: {
      token: "mock-token",
      userId: "user-1",
      username: "traveler",
      displayName: "The Traveler",
      role: "traveler",
    } as any,
    role: "traveler",
    onSignOut: () => alert("Sign out"),
    onManageFollowers: () => alert("Manage followers"),
    onReplayFollowerTour: () => alert("Replay tour"),
    onLoggedOut: () => {},
    onLocationDataCleared: () => {},
    onTripDataDeleted: () => {},
    onResetStarted: () => {},
  },
};

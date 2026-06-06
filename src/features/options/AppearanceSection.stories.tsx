import React, { useEffect } from "react";
/** @tag ai-generated */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeProvider } from "../../providers/ThemeProvider";
import OptionsSheet from "./OptionsSheet";
import { StorybookConvexProvider, useConvexMock } from "../../stories/convex-mock";
import { tripcastApi } from "../../convex/tripcastApi";

const MockHydrator = ({ children }: { children: React.ReactNode }) => {
  const { setQueryMock } = useConvexMock();
  useEffect(() => {
    setQueryMock(tripcastApi.travelerPreferences.travelerGetPreferences, {
      travelerTimeZone: "UTC",
      allowFollowersTripPath: true,
    });
    setQueryMock(tripcastApi.travelerPreferences.followerGetPreferences, {
      visible: true,
      travelerTimeZone: "UTC",
      allowFollowersTripPath: true,
    });
    setQueryMock(tripcastApi.missionSettings.travelerGetMissionSettings, {
      moderationMode: "manual_review",
      rateLimitPreset: "per_second",
    });
    setQueryMock(tripcastApi.liveTrail.travelerGetLiveTrailStatus, {
      enabled: false,
      visibleToFollowers: false,
      sampleCount: 0,
      samples: [],
    });
    setQueryMock(tripcastApi.travelerAutoState.travelerGetAutoState, {
      autoStateEnabled: false,
    });
    setQueryMock(tripcastApi.travelerAutoState.followerGetAutoState, {
      visible: false,
    });
  }, [setQueryMock]);
  return <>{children}</>;
};

const meta = {
  title: "Options/AppearanceSection",
  component: OptionsSheet,
  decorators: [
    (Story) => (
      <StorybookConvexProvider>
        <MockHydrator>
          <ThemeProvider>
            <Story />
          </ThemeProvider>
        </MockHydrator>
      </StorybookConvexProvider>
    ),
  ],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof OptionsSheet>;

export default meta;

export const Appearance: StoryObj<typeof meta> = {
  args: {
    open: true,
    onOpenChange: () => {},
    session: {
      token: "test",
      role: "traveler",
      sessionType: "legacy",
      displayName: "Traveler",
    },
    role: "traveler",
    onSignOut: () => {},
    onManageFollowers: () => {},
    onReplayFollowerTour: () => {},
    onLoggedOut: () => {},
    onLocationDataCleared: () => {},
    onTripDataDeleted: () => {},
    onResetStarted: () => {},
  },
};

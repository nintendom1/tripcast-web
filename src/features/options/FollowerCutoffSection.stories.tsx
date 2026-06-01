import type { Meta, StoryObj } from "@storybook/react-vite";
import { FollowerCutoffSection } from "./OptionsSheet";
import { tripcastApi } from "../../convex/tripcastApi";
import { useDebugLogger } from "../../debug/useDebugLogger";

const NOW = Date.UTC(2026, 5, 9, 9, 0);

function Story() {
  const log = useDebugLogger("FollowerCutoffSection.stories", "story");
  return <FollowerCutoffSection token="t" log={log} />;
}

const meta = {
  title: "Options/FollowerCutoffSection",
  component: Story,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Story>;

export default meta;

type S = StoryObj<typeof meta>;

const oldestRef = { timestamp: NOW - 30 * 24 * 60 * 60 * 1000, sourceType: "story" as const };
const baseCounts = { stories: 12, missions: 4, routeVotes: 1, trailSamples: 287 };

/** Toggle off, no saved date — fresh state. */
export const Disabled: S = {
  parameters: {
    convexMocks: {
      queries: [
        {
          query: tripcastApi.travelerPreferences.travelerGetPreferences,
          result: {
            travelerTimeZone: "America/Los_Angeles",
            allowFollowersTripPath: false,
            sleepHoursEnabled: false,
            sleepStaleThresholdMs: 0,
            followerContentCutoffEnabled: false,
            updatedAt: NOW,
          },
        },
        { query: tripcastApi.travelerPreferences.travelerGetOldestContent, result: oldestRef },
      ],
    },
  },
};

/** Toggle on but no date saved yet — pickers enabled, Save still disabled. */
export const EnabledNoDate: S = {
  parameters: {
    convexMocks: {
      queries: [
        {
          query: tripcastApi.travelerPreferences.travelerGetPreferences,
          result: {
            travelerTimeZone: "America/Los_Angeles",
            allowFollowersTripPath: false,
            sleepHoursEnabled: false,
            sleepStaleThresholdMs: 0,
            followerContentCutoffEnabled: true,
            updatedAt: NOW,
          },
        },
        { query: tripcastApi.travelerPreferences.travelerGetOldestContent, result: oldestRef },
      ],
    },
  },
};

/** Toggle on, date saved — shows current cutoff, hidden counts, preview toggle. */
export const EnabledWithDate: S = {
  parameters: {
    convexMocks: {
      queries: [
        {
          query: tripcastApi.travelerPreferences.travelerGetPreferences,
          result: {
            travelerTimeZone: "America/Los_Angeles",
            allowFollowersTripPath: false,
            sleepHoursEnabled: false,
            sleepStaleThresholdMs: 0,
            followerContentCutoffAt: NOW,
            followerContentCutoffEnabled: true,
            updatedAt: NOW,
          },
        },
        { query: tripcastApi.travelerPreferences.travelerGetOldestContent, result: oldestRef },
        { query: tripcastApi.travelerPreferences.travelerCountContentBeforeCutoff, result: baseCounts },
      ],
    },
  },
};

/** Brand-new trip with no journal events or missions yet. */
export const NoContent: S = {
  parameters: {
    convexMocks: {
      queries: [
        {
          query: tripcastApi.travelerPreferences.travelerGetPreferences,
          result: {
            travelerTimeZone: "America/Los_Angeles",
            allowFollowersTripPath: false,
            sleepHoursEnabled: false,
            sleepStaleThresholdMs: 0,
            followerContentCutoffEnabled: false,
            updatedAt: NOW,
          },
        },
        { query: tripcastApi.travelerPreferences.travelerGetOldestContent, result: null },
      ],
    },
  },
};

/** Preferences not yet loaded — every value undefined, controls render in
 *  their loading shape. */
export const Loading: S = {
  parameters: {
    convexMocks: { queries: [] },
  },
};

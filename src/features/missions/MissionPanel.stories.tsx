import type { Meta, StoryObj } from "@storybook/react-vite";
import MissionPanel from "./MissionPanel";
import { tripcastApi } from "../../convex/tripcastApi";
const meta = { title: "Missions/MissionPanel", component: MissionPanel as any, parameters: { layout: "fullscreen" }, } satisfies Meta<any>;
export default meta;
const FAKE_MISSIONS = [{ _id: "m1", title: "Explore", status: "visible", source: "traveler", createdAt: Date.now(), updatedAt: Date.now() }];
 /** @tag ai-generated */
export const Default: StoryObj<typeof meta> = {
  args: { token: "t", open: true, role: "traveler", onClose: () => {}, onRequestCoordinatePick: () => {}, onVoteOverlayChange: () => {}, onRequestFitMap: () => {}, fallbackOrigin: null },
  parameters: {
    convexMocks: {
      queries: [
        { query: tripcastApi.missions.travelerListMissions, result: FAKE_MISSIONS },
        { query: tripcastApi.missionSettings.travelerGetMissionSettings, result: { moderationMode: "manual_review", rateLimitPreset: "off" } },
        { query: tripcastApi.attributions.listAttributionsForSource, result: { publicCopy: "Bob" } },
      ]
    }
  }
};

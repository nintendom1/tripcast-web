import type { Meta, StoryObj } from "@storybook/react-vite";
import JournalSheet from "./JournalSheet";
import { tripcastApi } from "../../convex/tripcastApi";
const meta = { title: "Journal/JournalSheet", component: JournalSheet as any, parameters: { layout: "fullscreen" }, } satisfies Meta<any>;
export default meta;
const FAKE_EVENTS = [{ _id: "e1", type: "story", narrativeLevel: "narrative", title: "Day 1", body: "Started!", occurredAt: Date.now() }];
 /** @tag ai-generated */
export const Default: StoryObj<typeof meta> = {
  args: { token: "t", open: true, events: FAKE_EVENTS, onMarkAllRead: () => {}, onClose: () => {}, onStorySelect: () => {}, onLocationFocus: () => {} },
  parameters: {
    convexMocks: {
      queries: [
        { query: tripcastApi.journalEvents.listJournalEvents, result: FAKE_EVENTS },
        { query: tripcastApi.travelFunds.getLinkedCostMap, result: { byCheckpointId: {}, byMissionId: {} } },
        { query: tripcastApi.attributions.listAttributionsForSource, result: { publicCopy: "Alice" } },
      ]
    }
  }
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import JournalSheet from "./JournalSheet";
import { tripcastApi } from "../../convex/tripcastApi";
const meta = { title: "Journal/JournalSheet", component: JournalSheet as any, parameters: { layout: "fullscreen" }, } satisfies Meta<any>;
export default meta;
const FAKE_EVENTS = [
  {
    _id: "e1",
    type: "story",
    narrativeLevel: "narrative",
    title: "Day 1",
    body: "Started!",
    occurredAt: Date.now(),
    checkpointId: "cp1",
    reactions: {
      entries: [{ emoji: "❤️", count: 5 }, { emoji: "👍", count: 2 }, { emoji: "😹", count: 1 }],
      myReaction: "❤️",
    },
  },
  {
    _id: "e2",
    type: "story",
    narrativeLevel: "narrative",
    title: "Day 2 — Quiet morning",
    body: "Coffee by the window.",
    occurredAt: Date.now() - 3600_000,
    checkpointId: "cp2",
    reactions: { entries: [] },
  },
];
 /** @tag ai-generated */
export const Default: StoryObj<typeof meta> = {
  args: { token: "t", role: "follower", open: true, events: FAKE_EVENTS, onMarkAllRead: () => {}, onClose: () => {}, onStorySelect: () => {}, onLocationFocus: () => {} },
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

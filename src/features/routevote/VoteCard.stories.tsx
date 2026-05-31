import type { Meta, StoryObj } from "@storybook/react-vite";
import { VoteCard } from "./RouteVotePanel";
const meta = { title: "RouteVote/VoteCard", component: VoteCard as any, parameters: { layout: "centered" }, decorators: [(Story) => <div className="w-[390px] p-4 bg-[var(--bg-paper)]"><Story /></div>] } satisfies Meta<any>;
export default meta;
const baseVote: any = { _id: "v1", title: "Next City", effectiveStatus: "active", options: [], optionVoteCounts: {} };
 /** @tag ai-generated */
export const Active: StoryObj<typeof meta> = { args: { vote: baseVote, showTallies: true, onSelect: () => {} } };

import type { Meta, StoryObj } from "@storybook/react";
import { SheetGradientHeader } from "../../components/ui/sheet";
import { MEADOW_SHEET_PERSONALITIES, CONSTELLATION_SHEET_PERSONALITIES } from "./sheetPersonality";

const meta = {
  title: "Redesign/SheetPersonalities",
  component: SheetGradientHeader,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs", "ai-generated"],
} satisfies Meta<typeof SheetGradientHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const JournalMeadow: Story = {
  args: {
    color: MEADOW_SHEET_PERSONALITIES.journal.color,
    bg: MEADOW_SHEET_PERSONALITIES.journal.bg,
    children: <h2 className="text-xl font-bold">Journal</h2>,
  },
};

export const MissionsMeadow: Story = {
  args: {
    color: MEADOW_SHEET_PERSONALITIES.missions.color,
    bg: MEADOW_SHEET_PERSONALITIES.missions.bg,
    children: <h2 className="text-xl font-bold">Missions</h2>,
  },
};

export const VotesMeadow: Story = {
  args: {
    color: MEADOW_SHEET_PERSONALITIES.votes.color,
    bg: MEADOW_SHEET_PERSONALITIES.votes.bg,
    children: <h2 className="text-xl font-bold">Votes</h2>,
  },
};

export const StateMeadow: Story = {
  args: {
    color: MEADOW_SHEET_PERSONALITIES.state.color,
    bg: MEADOW_SHEET_PERSONALITIES.state.bg,
    children: <h2 className="text-xl font-bold">State</h2>,
  },
};

export const JournalConstellation: Story = {
  args: {
    color: CONSTELLATION_SHEET_PERSONALITIES.journal.color,
    bg: CONSTELLATION_SHEET_PERSONALITIES.journal.bg,
    children: <h2 className="text-xl font-bold">Journal (Dark)</h2>,
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { PendingTrailPreview } from "./PendingTrailPreview";

const meta = { title: "Map/PendingTrailPreview", component: PendingTrailPreview } satisfies Meta<typeof PendingTrailPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Meadow: Story = { args: { theme: "meadow" } };
export const Constellation: Story = { args: { theme: "constellation" } };

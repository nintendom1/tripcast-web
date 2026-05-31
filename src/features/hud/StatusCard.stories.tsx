import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusCard } from "./StatusCard";
const meta = { title: "HUD/StatusCard", component: StatusCard, parameters: { layout: "centered" }, decorators: [(Story) => <div className="w-[390px] p-4"><Story /></div>] } satisfies Meta<typeof StatusCard>;
export default meta;
 /** @tag ai-generated */
export const Default: StoryObj<typeof meta> = { args: { activityLabel: "Hiking", meters: [] } };

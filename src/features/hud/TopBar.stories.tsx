import type { Meta, StoryObj } from "@storybook/react-vite";
import { TopBar } from "./TopBar";
const meta = { title: "HUD/TopBar", component: TopBar, parameters: { layout: "fullscreen" } } satisfies Meta<typeof TopBar>;
export default meta;
 /** @tag ai-generated */
export const Traveler: StoryObj<typeof meta> = { args: { role: "traveler", onOpenOptions: () => {} } };

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";
const meta = { title: "UI/Badge", component: Badge, parameters: { layout: "centered" } } satisfies Meta<typeof Badge>;
export default meta;
 /** @tag ai-generated */
export const Default: StoryObj<typeof meta> = { args: { children: "Badge" } };

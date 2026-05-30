import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
const meta = { title: "UI/Button", component: Button, parameters: { layout: "centered" }, tags: ["autodocs"] } satisfies Meta<typeof Button>;
export default meta;
 /** @tag ai-generated */
export const Default: StoryObj<typeof meta> = { args: { children: "Button" } };

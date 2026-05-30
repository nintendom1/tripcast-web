import type { Meta, StoryObj } from "@storybook/react-vite";
import { OptionsRow } from "./OptionsSheet";
import { Settings } from "lucide-react";
const meta = { title: "Options/OptionsRow", component: OptionsRow as any, parameters: { layout: "centered" }, decorators: [(Story) => <div className="w-[390px] border bg-[var(--bg-card)]"><Story /></div>] } satisfies Meta<any>;
export default meta;
 /** @tag ai-generated */
export const Default: StoryObj<typeof meta> = { args: { icon: Settings, title: "Settings", onClick: () => {} } };

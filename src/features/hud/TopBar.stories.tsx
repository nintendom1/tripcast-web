import type { Meta, StoryObj } from "@storybook/react-vite";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { TopBar } from "./TopBar";
const meta = {
  title: "HUD/TopBar",
  component: TopBar,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <TripContextTestProvider>
        <Story />
      </TripContextTestProvider>
    ),
  ],
} satisfies Meta<typeof TopBar>;
export default meta;
 /** @tag ai-generated */
export const Traveler: StoryObj<typeof meta> = { args: { role: "traveler", onOpenOptions: () => {} } };

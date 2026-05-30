import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusCardConnected } from "./StatusCardConnected";
import { tripcastApi } from "../../convex/tripcastApi";
const meta = { title: "HUD/StatusCardConnected", component: StatusCardConnected, parameters: { layout: "centered" }, decorators: [(Story) => <div className="w-[390px] p-4"><Story /></div>], } satisfies Meta<typeof StatusCardConnected>;
export default meta;
 /** @tag ai-generated */
export const Default: StoryObj<typeof meta> = {
  args: { token: "t", role: "traveler", onOpenState: () => {} },
  parameters: {
    convexMocks: {
      queries: [
        { query: tripcastApi.travelerState.travelerGetState, result: { state: { energyLevel: "high", stomachLevel: "satisfied", stressLevel: "calm" }, visibility: { showEnergy: true, showStomach: true, showStress: true } } },
        { query: tripcastApi.currentActivity.travelerGetCurrentActivity, result: { title: "Resting", emoji: "😴", startedAt: Date.now() - 3600000 } },
        { query: tripcastApi.travelerPreferences.travelerGetPreferences, result: { travelerTimeZone: "UTC" } },
      ]
    }
  }
};

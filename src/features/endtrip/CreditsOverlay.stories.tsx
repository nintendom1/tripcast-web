import type { Meta, StoryObj } from "@storybook/react-vite";
import CreditsOverlay from "./CreditsOverlay";
const meta = { title: "EndTrip/CreditsOverlay", component: CreditsOverlay as any, parameters: { layout: "fullscreen" } } satisfies Meta<any>;
export default meta;
 /** @tag ai-generated */
export const Default: StoryObj<typeof meta> = { args: { token: "t", role: "traveler", onClose: () => {} } };

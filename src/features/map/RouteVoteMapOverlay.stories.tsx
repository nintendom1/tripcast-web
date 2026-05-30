import type { Meta, StoryObj } from "@storybook/react-vite";
import RouteVoteMapOverlay from "./RouteVoteMapOverlay";
import { Minimap } from "../../stories/Minimap";
const meta = { title: "Map/RouteVoteMapOverlay", component: RouteVoteMapOverlay as any, parameters: { layout: "fullscreen" }, } satisfies Meta<any>;
export default meta;
const baseOverlay = { travelerLocation: { lat: 0, lon: 0 }, coordinateOptions: [ { optionId: "o1", title: "Option 1", lat: 0.01, lon: 0.01 }, { optionId: "o2", title: "Option 2", lat: -0.01, lon: -0.01 }, ] };
 /** @tag ai-generated */
export const Default: StoryObj<typeof meta> = {
  render: (args) => ( <Minimap>{(map) => <RouteVoteMapOverlay {...(args as any)} map={map} />}</Minimap> ),
  args: { overlay: baseOverlay as any, optionNumberById: { o1: 1, o2: 2 }, }
};

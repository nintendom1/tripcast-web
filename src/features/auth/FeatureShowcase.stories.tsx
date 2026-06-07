import type { Meta, StoryObj } from "@storybook/react-vite";
import { useReducedMotion } from "framer-motion";

import { useTheme } from "../../providers/ThemeProvider";
import { FeatureShowcase } from "./FeatureShowcase";

function ShowcasePreview({ forceReduceMotion }: { forceReduceMotion?: boolean }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "constellation";
  const systemReduceMotion = useReducedMotion();
  const reduceMotion = forceReduceMotion ?? systemReduceMotion;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <FeatureShowcase isDark={isDark} reduceMotion={reduceMotion} />
    </div>
  );
}

const meta = {
  title: "Auth/FeatureShowcase",
  component: FeatureShowcase,
  parameters: { layout: "fullscreen" },
  args: { isDark: false, reduceMotion: false },
} satisfies Meta<typeof FeatureShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The feature showcase shared by the Landing and Registration pages. The new
 * "Pulse" callout (Traveler state — animated Energy/Fullness/Calm meters with a
 * walking footprint trail, beat 6) sits 3rd, between Missions and Votes.
 * Switch the Theme toolbar (Meadow = light, Constellation = dark) to review both.
 */
export const Default: Story = {
  render: () => <ShowcasePreview />,
};

/** Reduced-motion fallback: meters and footsteps render static (no looping). */
export const ReducedMotion: Story = {
  render: () => <ShowcasePreview forceReduceMotion />,
};

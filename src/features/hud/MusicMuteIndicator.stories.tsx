import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { Play } from "lucide-react";
import { MusicMuteIndicator } from "./MusicMuteIndicator";

/**
 * Stories covering the collision between the mute pin and the cardsWrapper
 * Replay pill on narrow-desktop widths (~1380px). The "BugRepro" story renders
 * the pre-fix absolute-positioned mute so a future regression is caught; the
 * "InTripMapTopRightRegion" story renders the post-fix flex-row layout.
 */

function FakeStatusCard() {
  return (
    <div
      className="pointer-events-auto rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 shadow-[var(--shadow-card)]"
      style={{ minHeight: 110 }}
      role="group"
      aria-label="Traveler status"
    >
      <div className="text-sm font-semibold text-[var(--ink-1)]">Traveler status</div>
      <div className="mt-2 text-xs text-[var(--ink-2)]">
        Energy · Stomach · Stress meters render here in the real StatusCard.
      </div>
    </div>
  );
}

function ReplayPill() {
  return (
    <button
      type="button"
      className="pointer-events-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[var(--bg-card)] px-3 font-[var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-2)] shadow-[var(--shadow-card)] transition-colors hover:text-[var(--ink-1)]"
    >
      <Play className="h-3.5 w-3.5" aria-hidden="true" />
      Replay
    </button>
  );
}

function MapShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[var(--bg-paper)]">
      <div
        className="absolute inset-0 bg-gradient-to-b from-[var(--bg-paper)] to-[var(--bg-canvas)]"
        aria-hidden
      />
      {children}
    </div>
  );
}

function PostFixHud() {
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-[2] flex flex-col gap-2 tripcast-frame">
      <FakeStatusCard />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div />
        <div className="flex flex-col items-end gap-2">
          <ReplayPill />
          <MusicMuteIndicator className="pointer-events-auto" />
        </div>
      </div>
    </div>
  );
}

function BugReproHud() {
  // Reproduces the pre-fix layout: mute is rendered FIRST as an absolute overlay,
  // then the cardsWrapper renders later in the DOM. Same z-[2] but the wrapper
  // wins paint order, occluding the mute.
  return (
    <>
      <MusicMuteIndicator className="absolute right-3 top-[148px] z-[2]" />
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[2] flex flex-col gap-2 tripcast-frame">
        <FakeStatusCard />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <div />
          <ReplayPill />
        </div>
      </div>
    </>
  );
}

const meta = {
  title: "HUD/MusicMuteIndicator",
  component: MusicMuteIndicator,
  parameters: {
    layout: "fullscreen",
    viewport: {
      viewports: {
        desktopNarrow: {
          name: "Desktop Narrow (1380x900)",
          styles: { width: "1380px", height: "900px" },
        },
        mobile: {
          name: "Mobile (390x844)",
          styles: { width: "390px", height: "844px" },
        },
      },
      defaultViewport: "desktopNarrow",
    },
  },
} satisfies Meta<typeof MusicMuteIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    (Story) => (
      <div className="flex h-dvh items-center justify-center bg-[var(--bg-paper)] p-6">
        <Story />
      </div>
    ),
  ],
};

export const InTripMapTopRightRegion: Story = {
  render: () => (
    <MapShell>
      <PostFixHud />
    </MapShell>
  ),
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step("mute pin is rendered and visible", async () => {
      const mute = await canvas.findByRole("button", { name: /mute soundtrack|unmute soundtrack/i });
      await expect(mute).toBeVisible();
    });
    await step("mute pin is the top-most element at its own center (not occluded)", async () => {
      const mute = await canvas.findByRole("button", { name: /mute soundtrack|unmute soundtrack/i });
      const rect = mute.getBoundingClientRect();
      const centerEl = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      await expect(centerEl !== null && (centerEl === mute || mute.contains(centerEl))).toBe(true);
    });
  },
};

/**
 * Visual canary story showing the pre-fix layout. Kept as a render-only story
 * (no `play` assertion) — the automated assertion lives on
 * `InTripMapTopRightRegion` above, which verifies the post-fix layout. Open
 * this story in Storybook at the "Desktop Narrow (1380x900)" viewport to see
 * the original regression: the mute pin sits underneath the Replay pill.
 */
export const InTripMapTopRightRegion_BugRepro: Story = {
  name: "InTripMapTopRightRegion · Bug Repro (pre-fix layout)",
  render: () => (
    <MapShell>
      <BugReproHud />
    </MapShell>
  ),
};

import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, fn, waitFor, within } from "storybook/test";
import { LivePill } from "./LivePill";
import { setSamplerMode } from "../../lib/samplerMode";

function InteractiveLivePill({
  initialOn,
  trailEnabled = false,
}: {
  initialOn: boolean;
  trailEnabled?: boolean;
}) {
  const [on, setOn] = useState(initialOn);

  useEffect(() => {
    setSamplerMode("relevant");
    return () => setSamplerMode("relevant");
  }, []);

  return (
    <LivePill
      on={on}
      onToggle={() => setOn((current) => !current)}
      trailEnabled={trailEnabled}
      className="pointer-events-auto"
    />
  );
}

function FakeStatusCard() {
  return (
    <div className="pointer-events-auto min-h-24 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 shadow-[var(--shadow-card)]">
      <div className="text-sm font-semibold text-[var(--ink-1)]">Traveler status</div>
      <div className="mt-2 text-xs text-[var(--ink-2)]">
        Energy · Stomach · Stress
      </div>
    </div>
  );
}

function FakeFundsChip() {
  return (
    <div className="pointer-events-auto rounded-full bg-[var(--bg-card)] px-3 py-1 text-xs font-semibold text-[var(--ink-2)] shadow-[var(--shadow-card)]">
      ¥24,000
    </div>
  );
}

function MapHudFixture() {
  return (
    <div
      data-testid="map-shell"
      className="relative h-dvh w-full overflow-hidden bg-[var(--bg-canvas)]"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-[var(--bg-paper)] to-[var(--bg-canvas)]"
      />
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[2] flex flex-col gap-2 tripcast-frame">
        <FakeStatusCard />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <InteractiveLivePill initialOn />
            <FakeFundsChip />
          </div>
          <button
            type="button"
            className="pointer-events-auto rounded-full bg-[var(--bg-card)] px-3 py-2 text-[10px] font-bold uppercase text-[var(--ink-2)] shadow-[var(--shadow-card)]"
          >
            Replay
          </button>
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "HUD/LivePill",
  component: LivePill,
  args: {
    on: true,
    onToggle: fn(),
    trailEnabled: false,
  },
  parameters: {
    viewport: {
      viewports: {
        mobile: {
          name: "Mobile (390x844)",
          styles: { width: "390px", height: "844px" },
        },
        desktop: {
          name: "Desktop (1380x900)",
          styles: { width: "1380px", height: "900px" },
        },
      },
      defaultViewport: "mobile",
    },
  },
} satisfies Meta<typeof LivePill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {
  decorators: [
    (Story) => (
      <div className="flex min-h-72 items-center justify-center bg-[var(--bg-canvas)] p-8">
        <Story />
      </div>
    ),
  ],
};

export const PausedWithTrail: Story = {
  args: {
    on: false,
    trailEnabled: true,
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-72 items-center justify-center bg-[var(--bg-canvas)] p-8">
        <Story />
      </div>
    ),
  ],
};

export const LivePowerSaving: Story = {
  args: {
    on: true,
    trackingMode: "power-saving",
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-72 items-center justify-center bg-[var(--bg-canvas)] p-8">
        <Story />
      </div>
    ),
  ],
};

export const DownwardPrecisionMenuInMapHud: Story = {
  render: () => <MapHudFixture />,
  parameters: {
    layout: "fullscreen",
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const pill = await canvas.findByRole("button", { name: /stop sharing live location/i });
    const pillRect = pill.getBoundingClientRect();
    const centerX = pillRect.left + pillRect.width / 2;
    const centerY = pillRect.top + pillRect.height / 2;

    await step("hold for 200ms to open the precision menu", async () => {
      fireEvent.pointerDown(pill, {
        button: 0,
        pointerId: 1,
        clientX: centerX,
        clientY: centerY,
      });
      await waitFor(
        () => expect(canvas.getByRole("menu", { name: /gps precision options/i })).toBeVisible(),
        { timeout: 1000 },
      );
    });

    await step("menu opens downward and remains inside the clipped map shell", async () => {
      const shellRect = canvas.getByTestId("map-shell").getBoundingClientRect();
      const menu = canvas.getByRole("menu", { name: /gps precision options/i });
      const optionLabels = canvas
        .getAllByRole("menuitem")
        .map((option) => option.textContent);

      await expect(optionLabels).toEqual(["Legacy", "Relevant", "Precise"]);
      await waitFor(
        () => expect(menu.getBoundingClientRect().top).toBeGreaterThanOrEqual(pillRect.bottom),
        { timeout: 1000 },
      );
      const menuRect = menu.getBoundingClientRect();
      await expect(menuRect.left).toBeGreaterThanOrEqual(shellRect.left);
      await expect(menuRect.right).toBeLessThanOrEqual(shellRect.right);
      await expect(menuRect.bottom).toBeLessThanOrEqual(shellRect.bottom);
    });

    await step("stationary release keeps the menu open for tap selection", async () => {
      fireEvent.pointerUp(pill, {
        button: 0,
        pointerId: 1,
        clientX: centerX,
        clientY: centerY,
      });
      await expect(canvas.getByRole("menu", { name: /gps precision options/i })).toBeVisible();
      fireEvent.click(canvas.getByRole("menuitem", { name: "Precise" }));
      await waitFor(() =>
        expect(canvas.queryByRole("menu", { name: /gps precision options/i })).not.toBeInTheDocument(),
      );
    });
  },
};

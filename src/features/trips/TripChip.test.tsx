import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../../providers/ThemeProvider";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "./tripTypes";
import { TripChip } from "./TripChip";

vi.mock("convex/react", () => ({
  useConvex: () => ({ query: vi.fn() }),
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
}));

const sheet = vi.hoisted(() => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { loads: 0, gate, release: () => release() };
});

// The pane is a lazy chunk; this stub holds the first load open, then fails it, so a test can see the busy state and
// the retry.
vi.mock("./TripSwitcherSheet", async () => {
  sheet.loads += 1;
  await sheet.gate;
  if (sheet.loads === 1) throw new Error("chunk failed");
  return { TripSwitcherSheet: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Trips" /> : null) };
});

const autumn = { tripId: "t-autumn", title: "Autumn 2026" };

function renderChip(value: Partial<TripContextValue>) {
  return render(
    <ThemeProvider>
      <TripContextTestProvider value={value}>
        <TripChip />
      </TripContextTestProvider>
    </ThemeProvider>,
  );
}

describe("TripChip", () => {
  it("is absent for a Follower", () => {
    renderChip({ role: "follower", multiTripEnabled: true, viewingTrip: autumn });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("is absent while multi-trip is disabled", () => {
    renderChip({ multiTripEnabled: false, viewingTrip: autumn });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("reads Current · <title> while following the current trip", () => {
    renderChip({ multiTripEnabled: true, viewingTrip: autumn });
    const chip = screen.getByRole("button", { name: "Current · Autumn 2026" });
    expect(chip).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("reads Viewing privately · <title> in private view", () => {
    renderChip({
      multiTripEnabled: true,
      viewingMode: "private",
      viewingTripId: "t-summer",
      viewingTrip: { tripId: "t-summer", title: "Summer 2026" },
    });
    expect(screen.getByRole("button", { name: "Viewing privately · Summer 2026" })).toBeInTheDocument();
  });

  it("fits a phone header: flexible slot, title only below sm, label still in the accessible name", () => {
    renderChip({ multiTripEnabled: true, viewingTrip: autumn });
    const chip = screen.getByRole("button", { name: "Current · Autumn 2026" });
    expect(chip).toHaveClass("flex-1", "min-w-0");
    expect(screen.getByText("Autumn 2026")).toHaveClass("truncate", "min-w-0");
    const label = screen.getByText("Current ·");
    expect(label).toHaveClass("hidden", "sm:inline", "min-w-0");
    expect(label).not.toHaveClass("shrink-0");
  });

  it("shows a busy status while the pane chunk loads and retries a failed load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    renderChip({ multiTripEnabled: true, viewingTrip: autumn });
    await user.click(screen.getByRole("button", { name: "Current · Autumn 2026" }));
    expect(await screen.findByRole("status", { name: "" })).toHaveAttribute("aria-busy", "true");

    sheet.release();
    await user.click(await screen.findByRole("button", { name: /Retry/ }));
    expect(await screen.findByRole("dialog", { name: "Trips" })).toBeInTheDocument();
    expect(sheet.loads).toBe(2);
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../../providers/ThemeProvider";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { TripsPaneToggle } from "./TripsPaneToggle";

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

describe("TripsPaneToggle: the pane's lazy chunk", () => {
  it("shows a busy status while the pane chunk loads and retries a failed load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <TripContextTestProvider value={{ multiTripEnabled: true, viewingTrip: { tripId: "t-autumn", title: "Autumn 2026" } }}>
          <TripsPaneToggle logoClassName="flex" logo="TripCast" />
        </TripContextTestProvider>
      </ThemeProvider>,
    );
    await user.click(screen.getByRole("button", { name: "TripCast: Trips" }));
    expect(await screen.findByRole("status", { name: "" })).toHaveAttribute("aria-busy", "true");

    sheet.release();
    await user.click(await screen.findByRole("button", { name: /Retry/ }));
    expect(await screen.findByRole("dialog", { name: "Trips" })).toBeInTheDocument();
    expect(sheet.loads).toBe(2);
  });
});

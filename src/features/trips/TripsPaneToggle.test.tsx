import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../../providers/ThemeProvider";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { announcePaneOpened, subscribePaneOpened, type PaneOwner } from "./paneExclusion";
import { setSwitchPending } from "./tripSwitchState";
import type { TripContextValue } from "./tripTypes";
import { TripsPaneToggle } from "./TripsPaneToggle";

vi.mock("convex/react", () => ({
  useConvex: () => ({ query: () => new Promise(() => {}) }),
  useQuery: () => undefined,
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
}));

const autumn = { tripId: "t-autumn", title: "Autumn 2026" };
const LOGO_CLASS = "flex items-center gap-2";
const LOGO = <span>TripCast</span>;

function renderToggle(value: Partial<TripContextValue>) {
  return render(
    <ThemeProvider>
      <TripContextTestProvider value={value}>
        <TripsPaneToggle logoClassName={LOGO_CLASS} logo={LOGO} />
      </TripContextTestProvider>
    </ThemeProvider>,
  );
}

/**
 * A finger tap in the order iOS Safari sends it: pointer and touch events, then the compatibility mouse events, then
 * the click. Each is its own task, so React renders between them (as on the device). The pane, being non-modal,
 * treats the mousedown of a touch as an outside press.
 */
function tap(element: Element) {
  fireEvent.pointerDown(element, { pointerType: "touch", button: 0, isPrimary: true });
  fireEvent.touchStart(element, { touches: [{ clientX: 1, clientY: 1 }] });
  fireEvent.pointerUp(element, { pointerType: "touch", button: 0, isPrimary: true });
  fireEvent.touchEnd(element, { touches: [], changedTouches: [{ clientX: 1, clientY: 1 }] });
  fireEvent.mouseDown(element, { button: 0 });
  fireEvent.mouseUp(element, { button: 0 });
  fireEvent.click(element, { button: 0 });
}

// The toggle loads the pane lazily; warm the module so a loaded CI machine does not time the first test out.
beforeAll(async () => {
  await import("./TripSwitcherSheet");
}, 60_000);

afterEach(() => {
  act(() => setSwitchPending(false));
});

describe("TripsPaneToggle: inert logo", () => {
  it.each([
    ["a Follower", { role: "follower", multiTripEnabled: true, viewingTrip: autumn }],
    ["multi-trip off", { multiTripEnabled: false, viewingTrip: autumn }],
  ] as const)("is the plain logo div for %s", (_case, value) => {
    const { container } = renderToggle(value);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.innerHTML).toBe(`<div class="${LOGO_CLASS}"><span>TripCast</span></div>`);
  });
});

describe("TripsPaneToggle: the logo button", () => {
  it("is named for the pane, says it opens a dialog, and keeps the bar's height", () => {
    renderToggle({ multiTripEnabled: true, viewingTrip: autumn });
    const logo = screen.getByRole("button", { name: "TripCast: Trips" });
    expect(logo).toHaveAttribute("aria-haspopup", "dialog");
    expect(logo).toHaveAttribute("aria-expanded", "false");
    expect(logo).not.toHaveAttribute("aria-busy");
    // 44px to tap, 36px in the row (the row's other buttons are 36px).
    expect(logo).toHaveClass(LOGO_CLASS, "h-11", "-my-1", "-ml-2", "px-2");
    expect(logo).toHaveTextContent("TripCast");
    expect(screen.queryByTestId("trips-pane-dot")).not.toBeInTheDocument();
  });

  it("shows the dot and says so in a private view", () => {
    renderToggle({
      multiTripEnabled: true,
      viewingMode: "private",
      viewingTripId: "t-summer",
      viewingTrip: { tripId: "t-summer", title: "Summer 2026" },
    });
    expect(screen.getByRole("button", { name: "TripCast: Trips, viewing privately" })).toBeInTheDocument();
    const dot = screen.getByTestId("trips-pane-dot");
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).not.toHaveClass("animate-pulse");
  });

  it("is busy and its dot pulses while a switch awaits the server, and it still opens the pane", async () => {
    renderToggle({ multiTripEnabled: true, viewingTrip: autumn });
    act(() => setSwitchPending(true));
    const logo = screen.getByRole("button", { name: "TripCast: Trips, switching…" });
    expect(logo).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("trips-pane-dot")).toHaveClass("animate-pulse");
    await userEvent.click(logo);
    expect(await screen.findByRole("dialog", { name: "Trips" })).toBeInTheDocument();
  });
});

describe("TripsPaneToggle: show and hide", () => {
  it("a tap opens the pane and a second tap on the logo hides it (real pointer events)", async () => {
    renderToggle({ multiTripEnabled: true, viewingTrip: autumn });
    const logo = screen.getByRole("button", { name: "TripCast: Trips" });

    tap(logo);
    expect(await screen.findByRole("dialog", { name: "Trips" })).toBeInTheDocument();
    expect(logo).toHaveAttribute("aria-expanded", "true");

    tap(logo);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(logo).toHaveAttribute("aria-expanded", "false");

    tap(logo);
    expect(await screen.findByRole("dialog", { name: "Trips" })).toBeInTheDocument();
  });

  it("a mouse click toggles it the same way", async () => {
    const user = userEvent.setup();
    renderToggle({ multiTripEnabled: true, viewingTrip: autumn });
    const logo = screen.getByRole("button", { name: "TripCast: Trips" });
    await user.click(logo);
    await screen.findByRole("dialog", { name: "Trips" });
    await user.click(logo);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("a tap anywhere else closes the pane", async () => {
    renderToggle({ multiTripEnabled: true, viewingTrip: autumn });
    tap(screen.getByRole("button", { name: "TripCast: Trips" }));
    await screen.findByRole("dialog", { name: "Trips" });
    tap(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("announces the Trips pane when it opens, not when it closes, and closes when a Dock pane opens", async () => {
    const heard: PaneOwner[] = [];
    const unsubscribe = subscribePaneOpened((owner) => heard.push(owner));
    renderToggle({ multiTripEnabled: true, viewingTrip: autumn });
    const logo = screen.getByRole("button", { name: "TripCast: Trips" });

    tap(logo);
    await screen.findByRole("dialog", { name: "Trips" });
    expect(heard).toEqual(["trips"]);

    act(() => announcePaneOpened("map"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(logo).toHaveAttribute("aria-expanded", "false");
    expect(heard).toEqual(["trips", "map"]);
    unsubscribe();
  });
});

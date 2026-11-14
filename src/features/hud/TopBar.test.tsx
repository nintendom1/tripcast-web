import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../../providers/ThemeProvider";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { TopBar } from "./TopBar";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark", "theme-dark");
  document.documentElement.removeAttribute("style");
});

describe("TopBar", () => {
  it("cycles between light, dark, and auto themes from the header", async () => {
    localStorage.setItem("tripcast.theme_mode", "meadow");
    render(
      <ThemeProvider>
        <TripContextTestProvider>
          <TopBar role="traveler" onOpenOptions={vi.fn()} />
        </TripContextTestProvider>
      </ThemeProvider>,
    );

    // Initial: meadow (Light)
    expect(screen.getByRole("button", { name: /current theme: light/i })).toBeInTheDocument();

    // Toggle 1: constellation (Dark)
    await userEvent.click(screen.getByRole("button", { name: /current theme: light/i }));
    expect(localStorage.getItem("tripcast.theme_mode")).toBe("constellation");
    expect(document.documentElement).toHaveClass("theme-dark");
    expect(screen.getByRole("button", { name: /current theme: dark/i })).toBeInTheDocument();

    // Toggle 2: auto
    await userEvent.click(screen.getByRole("button", { name: /current theme: dark/i }));
    expect(localStorage.getItem("tripcast.theme_mode")).toBe("auto");
    expect(screen.getByRole("button", { name: /current theme: auto/i })).toBeInTheDocument();

    // Toggle 3: meadow
    await userEvent.click(screen.getByRole("button", { name: /current theme: auto/i }));
    expect(localStorage.getItem("tripcast.theme_mode")).toBe("meadow");
    expect(screen.getByRole("button", { name: /current theme: light/i })).toBeInTheDocument();
  });

  it("keeps the logo the same inert div for a Follower and with multi-trip off (no Trips button)", () => {
    const { rerender } = render(
      <ThemeProvider>
        <TripContextTestProvider>
          <TopBar role="traveler" onOpenOptions={vi.fn()} />
        </TripContextTestProvider>
      </ThemeProvider>,
    );
    const travelerOff = screen.getByText("TripCast");
    expect(travelerOff.tagName).toBe("DIV");
    expect(travelerOff).toHaveClass(
      "flex items-center gap-2 font-[var(--font-display)] text-base font-extrabold tracking-tight text-[var(--ink-1)]",
    );
    expect(screen.queryByRole("button", { name: /TripCast/ })).not.toBeInTheDocument();
    const travelerOffMarkup = travelerOff.outerHTML;

    rerender(
      <ThemeProvider>
        <TripContextTestProvider value={{ role: "follower", multiTripEnabled: true }}>
          <TopBar role="follower" onOpenOptions={vi.fn()} />
        </TripContextTestProvider>
      </ThemeProvider>,
    );
    expect(screen.queryByRole("button", { name: /TripCast/ })).not.toBeInTheDocument();
    expect(screen.getByText("TripCast").outerHTML).toBe(travelerOffMarkup);
  });

  it("makes the logo the Trips button for a Traveler with multi-trip on, with the same logo inside", () => {
    const { rerender } = render(
      <ThemeProvider>
        <TripContextTestProvider value={{ role: "follower", multiTripEnabled: true }}>
          <TopBar role="follower" onOpenOptions={vi.fn()} />
        </TripContextTestProvider>
      </ThemeProvider>,
    );
    const inert = screen.getByText("TripCast");
    const inertContent = inert.innerHTML;
    const inertClass = inert.className;

    rerender(
      <ThemeProvider>
        <TripContextTestProvider
          value={{ multiTripEnabled: true, viewingTrip: { tripId: "t1", title: "Autumn 2026" } }}
        >
          <TopBar role="traveler" onOpenOptions={vi.fn()} />
        </TripContextTestProvider>
      </ThemeProvider>,
    );
    const logo = screen.getByRole("button", { name: "TripCast: Trips" });
    expect(logo.innerHTML).toBe(inertContent);
    expect(logo).toHaveClass(...inertClass.split(" "));
    // No trip name in the bar any more.
    expect(screen.queryByText("Autumn 2026")).not.toBeInTheDocument();
  });
});

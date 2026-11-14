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

  it("renders no trip chip while multi-trip is disabled or for a Follower", () => {
    const { rerender } = render(
      <ThemeProvider>
        <TripContextTestProvider>
          <TopBar role="traveler" onOpenOptions={vi.fn()} />
        </TripContextTestProvider>
      </ThemeProvider>,
    );
    expect(screen.queryByRole("button", { name: /current ·/i })).not.toBeInTheDocument();

    rerender(
      <ThemeProvider>
        <TripContextTestProvider value={{ role: "follower", multiTripEnabled: true }}>
          <TopBar role="follower" onOpenOptions={vi.fn()} />
        </TripContextTestProvider>
      </ThemeProvider>,
    );
    expect(screen.queryByRole("button", { name: /current ·/i })).not.toBeInTheDocument();
  });

  it("renders the trip chip for a Traveler with multi-trip enabled", () => {
    render(
      <ThemeProvider>
        <TripContextTestProvider
          value={{ multiTripEnabled: true, viewingTrip: { tripId: "t1", title: "Autumn 2026" } }}
        >
          <TopBar role="traveler" onOpenOptions={vi.fn()} />
        </TripContextTestProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole("button", { name: /current · autumn 2026/i })).toBeInTheDocument();
  });
});

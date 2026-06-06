import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../../providers/ThemeProvider";
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
        <TopBar role="traveler" onOpenOptions={vi.fn()} />
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
});

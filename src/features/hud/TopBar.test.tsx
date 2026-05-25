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
  it("toggles between light and dark themes from the header", async () => {
    localStorage.setItem("tripcast.theme_mode", "meadow");
    render(
      <ThemeProvider>
        <TopBar role="traveler" onOpenOptions={vi.fn()} />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /switch to dark theme/i }));

    expect(localStorage.getItem("tripcast.theme_mode")).toBe("constellation");
    expect(document.documentElement).toHaveClass("theme-dark");
    expect(screen.getByRole("button", { name: /switch to light theme/i })).toBeInTheDocument();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { ThemeProvider, useTheme } from "./ThemeProvider";

function ThemeProbe() {
  const { mode, resolvedTheme, resolvedMapBase, setMode } = useTheme();
  return (
    <div>
      <p>mode: {mode}</p>
      <p>resolved: {resolvedTheme}</p>
      <p>map: {resolvedMapBase}</p>
      <button type="button" onClick={() => setMode("constellation")}>
        Constellation
      </button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark", "theme-dark", "theme-transitioning");
  document.documentElement.removeAttribute("style");
});

describe("ThemeProvider", () => {
  it("applies Constellation variables and dark classes when selected", async () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Constellation" }));

    await waitFor(() => {
      expect(screen.getByText("mode: constellation")).toBeInTheDocument();
      expect(screen.getByText("resolved: constellation")).toBeInTheDocument();
      expect(screen.getByText("map: fiord")).toBeInTheDocument();
      expect(document.documentElement).toHaveClass("dark");
      expect(document.documentElement).toHaveClass("theme-dark");
      expect(document.documentElement).toHaveClass("theme-transitioning");
      expect(document.documentElement.style.getPropertyValue("--bg-paper")).toBe("#1c1f3a");
      expect(document.documentElement.style.getPropertyValue("--ink-danger")).toBe("#ff8aae");
      expect(document.documentElement.style.getPropertyValue("--danger")).toBe("#ff8aae");
    });
  });
});

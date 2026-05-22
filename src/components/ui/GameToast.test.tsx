import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GameToast } from "./GameToast";

describe("GameToast", () => {
  it("renders the title", () => {
    render(<GameToast title="Badge earned!" />);
    expect(screen.getByText("Badge earned!")).toBeInTheDocument();
  });

  it("renders the subtitle when provided", () => {
    render(<GameToast title="Badge earned!" subtitle="+10 pts" />);
    expect(screen.getByText("+10 pts")).toBeInTheDocument();
  });

  it("omits the subtitle when not provided", () => {
    render(<GameToast title="Badge earned!" />);
    expect(screen.queryByText(/pts/)).not.toBeInTheDocument();
  });

  it("renders emoji in the icon slot", () => {
    render(<GameToast title="Tasty" emoji="🍜" />);
    expect(screen.getByText("🍜")).toBeInTheDocument();
  });

  it("renders an svg icon as fallback when no emoji is provided", () => {
    const { container } = render(<GameToast title="Points!" kind="point" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("has role=status for live-region accessibility", () => {
    render(<GameToast title="Achievement" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("applies a custom accent color to border and icon background", () => {
    render(<GameToast title="Custom" accent="#6dba4a" />);
    const toast = screen.getByRole("status");
    expect(toast).toHaveStyle({ borderColor: "#6dba4a" });
  });
});

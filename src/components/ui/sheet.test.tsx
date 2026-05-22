import { render, screen } from "@testing-library/react";
import { Trophy } from "lucide-react";
import { describe, expect, it } from "vitest";

import { SheetPersonalityTag } from "./sheet";

describe("SheetPersonalityTag", () => {
  it("renders the tag label", () => {
    render(<SheetPersonalityTag tag="Tasks" />);
    expect(screen.getByText("Tasks")).toBeInTheDocument();
  });

  it("prefers the Icon over the motif glyph when both are provided", () => {
    const { container } = render(
      <SheetPersonalityTag tag="Tasks" Icon={Trophy} motif="🏆" />,
    );
    // Lucide renders an <svg>; the motif fallback span must not render.
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByText("🏆")).not.toBeInTheDocument();
  });

  it("falls back to the motif glyph when no Icon is given", () => {
    const { container } = render(<SheetPersonalityTag tag="Diary" motif="♥" />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
    expect(screen.getByText("♥")).toBeInTheDocument();
  });

  it("applies the accent color via inline style", () => {
    render(<SheetPersonalityTag tag="Vote" color="#7a9cdc" />);
    const tag = screen.getByText("Vote");
    expect(tag).toHaveStyle({ color: "#7a9cdc" });
  });
});

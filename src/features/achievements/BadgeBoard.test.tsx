import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { BadgeBoardEntry } from "../../convex/tripcastApi";
import BadgeBoard from "./BadgeBoard";

function entry(overrides: Partial<BadgeBoardEntry> = {}): BadgeBoardEntry {
  return {
    badgeType: "tasty",
    name: "Tasty",
    emoji: "🍜",
    description: "The Traveler liked the food.",
    earned: true,
    count: 1,
    awards: [],
    ...overrides,
  };
}

describe("BadgeBoard", () => {
  it("renders an earned chip with emoji + name", () => {
    render(<BadgeBoard badges={[entry()]} onSelect={vi.fn()} />);
    expect(screen.getByText("Tasty")).toBeInTheDocument();
    expect(screen.getByText("🍜")).toBeInTheDocument();
  });

  it("renders an unachieved chip as ??? with no badge name or emoji", () => {
    render(
      <BadgeBoard
        badges={[
          entry({ badgeType: "popular", name: "Popular", emoji: "🔥", earned: false, count: 0 }),
        ]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("???")).toBeInTheDocument();
    expect(screen.queryByText("Popular")).not.toBeInTheDocument();
    expect(screen.queryByText("🔥")).not.toBeInTheDocument();
  });

  it("never shows points on a chip", () => {
    render(<BadgeBoard badges={[entry()]} onSelect={vi.fn()} />);
    expect(screen.queryByText(/\+?\d+\s*(points?|pts)/i)).not.toBeInTheDocument();
  });

  it("shows a multiplier when earned more than once", () => {
    render(<BadgeBoard badges={[entry({ count: 3 })]} onSelect={vi.fn()} />);
    expect(screen.getByText("×3")).toBeInTheDocument();
  });

  it("calls onSelect with the entry when a chip is clicked", async () => {
    const onSelect = vi.fn();
    const e = entry();
    render(<BadgeBoard badges={[e]} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith(e);
  });
});

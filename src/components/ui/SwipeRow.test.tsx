import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SwipeRow } from "./SwipeRow";

describe("SwipeRow", () => {
  it("keeps closed row actions out of the keyboard tab order", () => {
    const { rerender } = render(
      <SwipeRow id="row-1" openId={null} onOpenChange={vi.fn()}>
        <button type="button">Row content</button>
      </SwipeRow>,
    );

    expect(screen.getByRole("button", { name: "Edit", hidden: true })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("button", { name: "Delete", hidden: true })).toHaveAttribute("tabindex", "-1");

    rerender(
      <SwipeRow id="row-1" openId="row-1" onOpenChange={vi.fn()}>
        <button type="button">Row content</button>
      </SwipeRow>,
    );

    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute("tabindex", "0");
  });
});

import { render, screen, fireEvent } from "@testing-library/react";
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

  it("clicking the ... button opens the row", () => {
    const onOpenChange = vi.fn();
    render(
      <SwipeRow id="row-1" openId={null} onOpenChange={onOpenChange}>
        <button type="button">Row content</button>
      </SwipeRow>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show row actions" }));
    expect(onOpenChange).toHaveBeenCalledWith("row-1");
  });

  it("clicking Edit when open calls onEdit and closes the row", () => {
    const onOpenChange = vi.fn();
    const onEdit = vi.fn();
    render(
      <SwipeRow id="row-1" openId="row-1" onOpenChange={onOpenChange} onEdit={onEdit}>
        <button type="button">Row content</button>
      </SwipeRow>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(null);
  });

  it("clicking Delete when open calls onDelete and closes the row", () => {
    const onOpenChange = vi.fn();
    const onDelete = vi.fn();
    render(
      <SwipeRow id="row-1" openId="row-1" onOpenChange={onOpenChange} onDelete={onDelete}>
        <button type="button">Row content</button>
      </SwipeRow>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(null);
  });
});

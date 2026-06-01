import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sheet, SheetCloseButton, SheetContent, SheetTitle } from "./sheet";

function TestSheet({ onOpenChange }: { onOpenChange: ComponentProps<typeof Sheet>["onOpenChange"] }) {
  return (
    <>
      <button type="button" data-debug-chip>
        Debug chip
      </button>
      <button type="button">Outside</button>
      <Sheet open modal={false} onOpenChange={onOpenChange}>
        <SheetContent showBackdrop={false}>
          <SheetTitle>Test sheet</SheetTitle>
          <p>Sheet content</p>
          <SheetCloseButton>Close</SheetCloseButton>
        </SheetContent>
      </Sheet>
    </>
  );
}

describe("Sheet", () => {
  it("ignores outside-press dismissal from the debug chip", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<TestSheet onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: "Debug chip" }));

    expect(onOpenChange).not.toHaveBeenCalledWith(false, expect.anything());
  });

  it("still forwards normal outside-press dismissal", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<TestSheet onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(onOpenChange).toHaveBeenCalledWith(false, expect.objectContaining({
      reason: "outside-press",
    }));
  });

  it("still forwards close-button dismissal", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<TestSheet onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onOpenChange).toHaveBeenCalledWith(false, expect.objectContaining({
      reason: "close-press",
    }));
  });
});

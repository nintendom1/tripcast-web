import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InfoTooltip, type InfoTooltipPlacement } from "./info-tooltip";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
}

function mockTooltipLayout({
  wrapper,
  trigger,
  tooltip,
}: {
  wrapper: DOMRect;
  trigger: DOMRect;
  tooltip: DOMRect;
}) {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute("role") === "tooltip") return tooltip;
    if (this.tagName === "BUTTON") return trigger;
    return wrapper;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  setViewport(1024, 768);
});

describe("InfoTooltip", () => {
  it("opens on click and renders tooltip content", () => {
    setViewport(390, 844);
    mockTooltipLayout({
      wrapper: rect(100, 10, 20, 20),
      trigger: rect(100, 10, 20, 20),
      tooltip: rect(100, 32, 288, 80),
    });

    render(
      <InfoTooltip label="About rate">
        Details about the rate.
      </InfoTooltip>,
    );

    fireEvent.click(screen.getByRole("button", { name: "About rate" }));

    expect(screen.getByRole("tooltip")).toHaveTextContent("Details about the rate.");
  });

  it("clamps the tooltip when the trigger is near the right viewport edge", async () => {
    const onOpenChange = vi.fn();
    setViewport(390, 844);
    mockTooltipLayout({
      wrapper: rect(340, 10, 20, 20),
      trigger: rect(360, 10, 20, 20),
      tooltip: rect(360, 32, 288, 80),
    });

    render(
      <InfoTooltip label="About rate" onOpenChange={onOpenChange}>
        Details about the rate.
      </InfoTooltip>,
    );

    fireEvent.click(screen.getByRole("button", { name: "About rate" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true, expect.any(Object)));

    const placement = onOpenChange.mock.calls[0][1] as InfoTooltipPlacement;
    expect(placement.clamped).toBe(true);
    expect(placement.width).toBe(288);
    expect(placement.left).toBe(-254);
    expect(placement.tooltip.left).toBe(86);
    expect(placement.tooltip.right).toBe(374);
    expect(screen.getByRole("tooltip")).toHaveStyle({
      left: "-254px",
      width: "288px",
    });
  });

  it("reports viewport, trigger, and tooltip placement details when opened", async () => {
    const onOpenChange = vi.fn();
    setViewport(320, 640);
    mockTooltipLayout({
      wrapper: rect(12, 20, 20, 20),
      trigger: rect(12, 20, 20, 20),
      tooltip: rect(12, 42, 288, 80),
    });

    render(
      <InfoTooltip label="About rate" onOpenChange={onOpenChange}>
        Details about the rate.
      </InfoTooltip>,
    );

    fireEvent.click(screen.getByRole("button", { name: "About rate" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true, expect.any(Object)));
    expect(onOpenChange.mock.calls[0][1]).toMatchObject({
      viewport: { width: 320, height: 640 },
      trigger: { left: 12, top: 20, right: 32, bottom: 40, width: 20, height: 20 },
      tooltip: { left: 16, right: 304, width: 288, height: 80 },
      left: 4,
      width: 288,
      clamped: true,
    });
  });

  it("closes on outside pointer and Escape", async () => {
    const onOpenChange = vi.fn();
    setViewport(390, 844);
    mockTooltipLayout({
      wrapper: rect(100, 10, 20, 20),
      trigger: rect(100, 10, 20, 20),
      tooltip: rect(100, 32, 288, 80),
    });

    const { rerender } = render(
      <>
        <InfoTooltip label="About rate" onOpenChange={onOpenChange}>
          Details about the rate.
        </InfoTooltip>
        <button type="button">Outside</button>
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "About rate" }));
    await waitFor(() => expect(screen.getByRole("tooltip")).toBeInTheDocument());

    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    rerender(
      <InfoTooltip label="About rate" onOpenChange={onOpenChange}>
        Details about the rate.
      </InfoTooltip>,
    );

    fireEvent.click(screen.getByRole("button", { name: "About rate" }));
    await waitFor(() => expect(screen.getByRole("tooltip")).toBeInTheDocument());

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});

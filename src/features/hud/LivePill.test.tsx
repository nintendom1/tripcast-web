import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { LivePill } from "./LivePill";
import { getSamplerMode, setSamplerMode } from "../../lib/samplerMode";

describe("LivePill hold-and-reveal gesture", () => {
  const mockOnToggle = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    mockOnToggle.mockClear();
    setSamplerMode("relevant"); // reset to default
    // Mock navigator.vibrate if it doesn't exist
    if (typeof window !== "undefined") {
      Object.defineProperty(window.navigator, "vibrate", {
        value: vi.fn(),
        writable: true,
        configurable: true,
      });
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("handles a normal quick click to toggle location sharing", () => {
    render(<LivePill on={false} onToggle={mockOnToggle} />);

    const button = screen.getByRole("button", { name: /start sharing live location/i });

    // Quick tap is handled by onClick in hybrid mode
    fireEvent.click(button);

    expect(mockOnToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens the menu after long press (250ms)", () => {
    render(<LivePill on={true} onToggle={mockOnToggle} />);

    const button = screen.getByRole("button", { name: /stop sharing live location/i });

    // Press down
    fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 });

    // Advance timers by 250ms
    act(() => {
      vi.advanceTimersByTime(250);
    });

    // The menu should now be open
    const menu = screen.getByRole("menu", { name: /gps precision options/i });
    expect(menu).toBeInTheDocument();

    // Verify option elements are shown
    expect(screen.getByText("Precise")).toBeInTheDocument();
    expect(screen.getByText("Relevant")).toBeInTheDocument();
    expect(screen.getByText("Legacy")).toBeInTheDocument();

    // Relevant is currently active, so check that it has selected highlight class
    const relevantBtn = screen.getByRole("menuitem", { name: "Relevant" });
    expect(relevantBtn).toHaveClass("bg-[var(--flag)]", "text-white");

    // Release pointer without drag (should keep menu open for tap)
    fireEvent.pointerUp(button, { clientX: 10, clientY: 10 });
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("allows selecting a mode by tapping/clicking on an option", () => {
    render(<LivePill on={true} onToggle={mockOnToggle} />);

    const button = screen.getByRole("button", { name: /stop sharing live location/i });

    // Long press to open menu
    fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    // Tap the "Precise" option
    const preciseBtn = screen.getByRole("menuitem", { name: "Precise" });
    fireEvent.click(preciseBtn);

    // Verify state updated and menu closed
    expect(getSamplerMode()).toBe("precise");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("allows selecting a mode by dragging (gliding) and releasing over the option", () => {
    render(<LivePill on={true} onToggle={mockOnToggle} />);

    const button = screen.getByRole("button", { name: /stop sharing live location/i });

    // Mock document.elementFromPoint to return our target button on move
    const preciseBtnSpy = document.createElement("button");
    preciseBtnSpy.setAttribute("data-mode", "precise");

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn().mockReturnValue(preciseBtnSpy);

    try {
      // Long press
      fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 });
      act(() => {
        vi.advanceTimersByTime(250);
      });

      // Move finger up to hover over the option
      fireEvent.pointerMove(button, { clientX: 10, clientY: -30 });

      // Precise option should now show hovered style (assert class/state)
      // Since it's a simulated move, document.elementFromPoint returned preciseBtnSpy,
      // setting hoveredMode to "precise"

      // Release finger
      fireEvent.pointerUp(button, { clientX: 10, clientY: -30 });

      // Precision mode is changed and menu closes
      expect(getSamplerMode()).toBe("precise");
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }
  });

  it("dismisses the menu when clicking/tapping outside", () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <LivePill on={true} onToggle={mockOnToggle} />
      </div>
    );

    const button = screen.getByRole("button", { name: /stop sharing live location/i });

    // Open menu
    fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    fireEvent.pointerUp(button, { clientX: 10, clientY: 10 });

    expect(screen.getByRole("menu")).toBeInTheDocument();

    // Click outside
    const outsideEl = screen.getByTestId("outside");
    fireEvent.pointerDown(outsideEl);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

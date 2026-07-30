import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LivePill } from "./LivePill";
import { getSamplerMode, setSamplerMode, type SamplerMode } from "../../lib/samplerMode";

const LONG_PRESS_MS = 200;
const POINTER_ID = 1;
const START = { clientX: 20, clientY: 20 };

function getPill() {
  return screen.getByRole("button", { name: /sharing live location/i });
}

function pressDown(button: HTMLElement) {
  fireEvent.pointerDown(button, {
    button: 0,
    pointerId: POINTER_ID,
    ...START,
  });
}

function release(button: HTMLElement, coords = START) {
  fireEvent.pointerUp(button, {
    button: 0,
    pointerId: POINTER_ID,
    ...coords,
  });
}

function openMenu(button: HTMLElement) {
  pressDown(button);
  act(() => {
    vi.advanceTimersByTime(LONG_PRESS_MS);
  });
  return screen.getByRole("menu", { name: /gps precision options/i });
}

describe("LivePill hold-and-reveal gesture", () => {
  const onToggle = vi.fn();
  let vibrate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onToggle.mockClear();
    setSamplerMode("relevant");
    vibrate = vi.fn();
    Object.defineProperty(window.navigator, "vibrate", {
      value: vibrate,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, "elementFromPoint");
    vi.useRealTimers();
  });

  it("handles a complete quick pointer tap without opening the menu", () => {
    render(<LivePill on={false} onToggle={onToggle} />);
    const pill = getPill();

    pressDown(pill);
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    });
    release(pill);
    fireEvent.click(pill, { detail: 1 });

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens at 200ms, not before, and suppresses the trailing click", () => {
    render(<LivePill on={true} onToggle={onToggle} />);
    const pill = getPill();

    pressDown(pill);
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    const menu = screen.getByRole("menu", { name: /gps precision options/i });
    expect(menu).toBeInTheDocument();
    expect(vibrate).toHaveBeenCalledWith(15);

    release(pill);
    fireEvent.click(pill, { detail: 1 });

    expect(onToggle).not.toHaveBeenCalled();
    expect(menu).toBeInTheDocument();
  });

  it("orders modes consistently and supports stationary release followed by tap selection", () => {
    render(<LivePill on={true} onToggle={onToggle} />);
    const pill = getPill();

    openMenu(pill);
    expect(screen.getAllByRole("menuitem").map((option) => option.textContent)).toEqual([
      "Legacy",
      "Relevant",
      "Precise",
    ]);
    expect(screen.getByRole("menuitem", { name: "Relevant" })).toHaveClass(
      "bg-[var(--flag)]",
      "text-white",
    );

    release(pill);
    fireEvent.click(pill, { detail: 1 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Precise" }));

    expect(getSamplerMode()).toBe("precise");
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it.each<SamplerMode>(["legacy", "relevant", "precise"])(
    "selects %s by gliding over the rendered option and releasing",
    (mode) => {
      setSamplerMode(mode === "relevant" ? "legacy" : "relevant");
      render(<LivePill on={true} onToggle={onToggle} />);
      const pill = getPill();

      openMenu(pill);
      const option = screen.getByRole("menuitem", {
        name: mode[0].toUpperCase() + mode.slice(1),
      });
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: vi.fn().mockReturnValue(option),
      });

      const glidePoint = { clientX: 20, clientY: 80 };
      fireEvent.pointerMove(pill, {
        pointerId: POINTER_ID,
        ...glidePoint,
      });
      expect(option).toHaveClass("bg-[var(--line-soft)]");

      release(pill, glidePoint);
      fireEvent.click(pill, { detail: 1 });

      expect(getSamplerMode()).toBe(mode);
      expect(vibrate).toHaveBeenCalledWith(10);
      expect(onToggle).not.toHaveBeenCalled();
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    },
  );

  it("cancels movement before 200ms without accidentally toggling sharing", () => {
    render(<LivePill on={true} onToggle={onToggle} />);
    const pill = getPill();

    pressDown(pill);
    fireEvent.pointerMove(pill, {
      pointerId: POINTER_ID,
      clientX: START.clientX + 9,
      clientY: START.clientY,
    });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS);
    });
    release(pill, { clientX: START.clientX + 9, clientY: START.clientY });
    fireEvent.click(pill, { detail: 1 });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onToggle).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.click(pill);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("resets without changing mode or sharing when the pointer is cancelled", () => {
    render(<LivePill on={true} onToggle={onToggle} />);
    const pill = getPill();

    openMenu(pill);
    fireEvent.pointerCancel(pill, {
      pointerId: POINTER_ID,
      ...START,
    });

    expect(getSamplerMode()).toBe("relevant");
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("dismisses the open menu when pressing outside", () => {
    render(
      <div>
        <button type="button">Outside</button>
        <LivePill on={true} onToggle={onToggle} />
      </div>,
    );
    const pill = getPill();

    openMenu(pill);
    release(pill);
    fireEvent.click(pill, { detail: 1 });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));

    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("clears a pending long-press timer when unmounted", () => {
    const { unmount } = render(<LivePill on={true} onToggle={onToggle} />);

    pressDown(getPill());
    expect(vi.getTimerCount()).toBe(1);
    unmount();

    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS);
    });
    expect(vibrate).not.toHaveBeenCalled();
  });
});

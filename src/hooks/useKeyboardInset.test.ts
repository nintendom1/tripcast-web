import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useKeyboardInset } from "./useKeyboardInset";

/** A stand-in for `window.visualViewport` whose size the test sets. */
class FakeViewport extends EventTarget {
  height = 800;
  offsetTop = 0;
  resize(height: number, offsetTop = 0) {
    this.height = height;
    this.offsetTop = offsetTop;
    this.dispatchEvent(new Event("resize"));
  }
}

const original = Object.getOwnPropertyDescriptor(window, "visualViewport");

function installViewport(viewport: FakeViewport | undefined) {
  Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
}

afterEach(() => {
  if (original) Object.defineProperty(window, "visualViewport", original);
  else delete (window as { visualViewport?: unknown }).visualViewport;
});

describe("useKeyboardInset", () => {
  it("is 0 where the visual viewport API is missing", () => {
    installViewport(undefined);
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
  });

  it("follows the part of the layout viewport the keyboard covers, and is 0 again when it closes", () => {
    const viewport = new FakeViewport();
    installViewport(viewport);
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);

    act(() => viewport.resize(500));
    expect(result.current).toBe(300);

    // A scrolled visual viewport (iOS pans it while typing) covers less of the bottom.
    act(() => {
      viewport.offsetTop = 40;
      viewport.dispatchEvent(new Event("scroll"));
    });
    expect(result.current).toBe(260);

    act(() => viewport.resize(800));
    expect(result.current).toBe(0);
  });

  it("removes its listeners on unmount", () => {
    const viewport = new FakeViewport();
    const remove = vi.spyOn(viewport, "removeEventListener");
    installViewport(viewport);
    const { unmount } = renderHook(() => useKeyboardInset());
    unmount();
    expect(remove.mock.calls.map(([type]) => type).sort()).toEqual(["resize", "scroll"]);
  });
});

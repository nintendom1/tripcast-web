import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DESKTOP_MIN_WIDTH, useIsDesktop } from "./useIsDesktop";

type Listener = (event: MediaQueryListEvent) => void;

// Minimal MediaQueryList stand-in for vitest. We use type assertion at the
// site of the matchMedia stub rather than `implements MediaQueryList` so we
// don't have to provide the full DOM event-listener overload surface.
class FakeMediaQueryList {
  matches: boolean;
  media: string;
  private listeners: Listener[] = [];

  constructor(media: string, matches: boolean) {
    this.media = media;
    this.matches = matches;
  }

  addEventListener(_type: "change", listener: Listener) {
    this.listeners.push(listener);
  }
  removeEventListener(_type: "change", listener: Listener) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }
  addListener(listener: Listener) {
    this.listeners.push(listener);
  }
  removeListener(listener: Listener) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }
  trigger(matches: boolean) {
    this.matches = matches;
    const event = { matches, media: this.media } as MediaQueryListEvent;
    this.listeners.forEach((l) => l(event));
  }
}

describe("useIsDesktop", () => {
  let mqList: FakeMediaQueryList;

  beforeEach(() => {
    mqList = new FakeMediaQueryList(`(min-width: ${DESKTOP_MIN_WIDTH}px)`, false);
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => {
        mqList.media = query;
        return mqList;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when the viewport is below the desktop breakpoint", () => {
    mqList.matches = false;
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it("returns true when the viewport is at/above the desktop breakpoint", () => {
    mqList.matches = true;
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });

  it("reacts to viewport resize transitions", () => {
    mqList.matches = false;
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);

    act(() => {
      mqList.trigger(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      mqList.trigger(false);
    });
    expect(result.current).toBe(false);
  });
});

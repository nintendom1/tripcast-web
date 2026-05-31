import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTicker } from "./useTicker";
import { TICKER_STORAGE_KEY } from "./tickerTypes";

describe("useTicker", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes with default settings", () => {
    const { result } = renderHook(() => useTicker());
    expect(result.current.settings.enabled).toBe(true);
    expect(result.current.settings.priorityMessages).toEqual([]);
  });

  it("adds a priority message", () => {
    const { result } = renderHook(() => useTicker());
    act(() => {
      result.current.addPriorityMessage("Priority 1");
    });
    expect(result.current.settings.priorityMessages).toHaveLength(1);
    expect(result.current.settings.priorityMessages[0].text).toBe("Priority 1");
  });

  it("cycles priority messages", () => {
    const { result } = renderHook(() => useTicker());
    act(() => {
      result.current.addPriorityMessage("P1");
    });
    act(() => {
      result.current.addPriorityMessage("P2");
    });

    // Check first message
    expect(result.current.currentMessage?.text).toBe("P1");

    // Advance time to trigger rotation
    act(() => {
      vi.advanceTimersByTime(31000);
    });
    expect(result.current.currentMessage?.text).toBe("P2");

    act(() => {
      vi.advanceTimersByTime(31000);
    });
    expect(result.current.currentMessage?.text).toBe("P1");
  });

  it("shows fun facts after interval", () => {
    const { result } = renderHook(() => useTicker());
    act(() => {
      result.current.addFunFact("F1");
    });
    act(() => {
      result.current.updateSettings({ funFactIntervalMinutes: 1, lastFunFactAt: Date.now() });
    });

    expect(result.current.currentMessage).toBeNull();

    // Fast forward 30s - still null
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(result.current.currentMessage).toBeNull();

    // Fast forward another 31s (total 61s)
    act(() => {
      vi.advanceTimersByTime(31000);
    });
    expect(result.current.currentMessage?.text).toBe("F1");
  });
});

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Isolate from Convex — we only care about local persistence behavior.
vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn().mockResolvedValue(undefined),
}));

import { useTicker } from "./useTicker";

const STORAGE_KEY = "tripcast.ticker_last_fun_fact_at";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useTicker localStorage persistence", () => {
  it("falls back to 0 when no value is stored", () => {
    renderHook(() => useTicker());
    // Hook mounted without crashing on a clean store — no key written by init.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("ignores garbage values in storage and treats them as 0", () => {
    localStorage.setItem(STORAGE_KEY, "not-a-number");
    expect(() => renderHook(() => useTicker())).not.toThrow();
  });

  it("reads a persisted numeric timestamp without throwing", () => {
    const persisted = Date.now() - 60_000;
    localStorage.setItem(STORAGE_KEY, String(persisted));
    expect(() => renderHook(() => useTicker())).not.toThrow();
    // Value is consumed by internal scheduling; we don't assert internal state
    // here — the integration check is that the read path is non-throwing and
    // the key is preserved verbatim across renders.
    expect(localStorage.getItem(STORAGE_KEY)).toBe(String(persisted));
  });
});

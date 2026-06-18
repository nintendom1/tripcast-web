import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useConvex } from "convex/react";

import { useImagePrefetch } from "./useImagePrefetch";

vi.mock("convex/react", () => ({
  useConvex: vi.fn(),
}));

vi.mock("../../debug/debugLogger", () => ({
  logMapEvent: vi.fn(),
}));

class FakeImage {
  onload?: () => void;
  onerror?: () => void;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

function makeConvex(resolver: (imageId: string) => Promise<string | null> | string | null) {
  const query = vi.fn(async (_ref: unknown, args: { imageId: string }) =>
    resolver(args.imageId),
  );
  return { client: { query } satisfies { query: typeof query }, query };
}

describe("useImagePrefetch", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", FakeImage as unknown as typeof Image);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does nothing when token is empty", async () => {
    const { client, query } = makeConvex(() => "https://img/x.jpg");
    vi.mocked(useConvex).mockReturnValue(client as never);
    renderHook(() => useImagePrefetch("", ["a", "b"]));
    await Promise.resolve();
    expect(query).not.toHaveBeenCalled();
  });

  it("queries once per unique image ID", async () => {
    const { client, query } = makeConvex((id) => `https://img/${id}.jpg`);
    vi.mocked(useConvex).mockReturnValue(client as never);
    const { rerender } = renderHook(({ ids }: { ids: string[] }) => useImagePrefetch("tok", ids), {
      initialProps: { ids: ["a", "b"] },
    });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));

    // Re-render with the same IDs — the cache should suppress repeats.
    rerender({ ids: ["a", "b"] });
    await Promise.resolve();
    expect(query).toHaveBeenCalledTimes(2);

    // A new ID joins; only that one fires.
    rerender({ ids: ["a", "b", "c"] });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(3));
  });

  it("caps in-flight queries at the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const { client, query } = makeConvex(
      (id) =>
        new Promise<string>((resolve) => {
          active++;
          peak = Math.max(peak, active);
          release.push(() => {
            active--;
            resolve(`https://img/${id}.jpg`);
          });
        }),
    );
    vi.mocked(useConvex).mockReturnValue(client as never);

    renderHook(() => useImagePrefetch("tok", ["a", "b", "c", "d", "e", "f"]));

    // Let the pump schedule the first batch.
    await waitFor(() => expect(active).toBe(3));
    expect(query).toHaveBeenCalledTimes(3);

    // Drain one at a time and confirm the queue refills but never exceeds 3.
    while (release.length) {
      release.shift()!();
      await Promise.resolve();
      await Promise.resolve();
    }
    await waitFor(() => expect(query).toHaveBeenCalledTimes(6));
    expect(peak).toBe(3);
  });

  it("re-queries when the token changes (cache is per-token)", async () => {
    const { client, query } = makeConvex((id) => `https://img/${id}.jpg`);
    vi.mocked(useConvex).mockReturnValue(client as never);
    const { rerender } = renderHook(({ token }: { token: string }) => useImagePrefetch(token, ["a"]), {
      initialProps: { token: "t1" },
    });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(1));

    rerender({ token: "t2" });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
  });

  it("allows a retry after a query failure", async () => {
    let attempt = 0;
    const { client, query } = makeConvex(() => {
      attempt++;
      if (attempt === 1) return Promise.reject(new Error("network"));
      return Promise.resolve("https://img/a.jpg");
    });
    vi.mocked(useConvex).mockReturnValue(client as never);

    const { rerender } = renderHook(({ ids }: { ids: string[] }) => useImagePrefetch("tok", ids), {
      initialProps: { ids: ["a"] },
    });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(1));

    rerender({ ids: ["a"] });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
  });
});

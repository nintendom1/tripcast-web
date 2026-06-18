import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LoadingImage } from "./LoadingImage";

describe("LoadingImage", () => {
  it("calls onLoad immediately while currentTarget is still valid", async () => {
    let capturedTarget: HTMLImageElement | null = null;
    const handleLoad = vi.fn((e: React.SyntheticEvent<HTMLImageElement>) => {
      capturedTarget = e.currentTarget;
    });

    render(
      <LoadingImage
        src="https://example.com/test.jpg"
        onLoad={handleLoad}
      />
    );

    const img = screen.getByRole("img", { hidden: true });

    // Mock decode to be asynchronous
    let resolveDecode: () => void;
    const decodePromise = new Promise<void>((resolve) => {
      resolveDecode = resolve;
    });
    (img as any).decode = vi.fn().mockReturnValue(decodePromise);

    // Trigger load
    fireEvent.load(img);

    // onLoad should have been called IMMEDIATELY
    expect(handleLoad).toHaveBeenCalled();
    expect(capturedTarget).not.toBeNull();
    // Cast restores the declared union: TS narrows closure-assigned `let`s back
    // to their initializer (`null`), which would make `?.src` deref `never`.
    expect((capturedTarget as HTMLImageElement | null)?.src).toBe("https://example.com/test.jpg");

    // The status should still be "loading" because decode hasn't finished
    const spinner = screen.queryByRole("status") || document.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();

    // Now resolve decode
    resolveDecode!();

    // Wait for the spinner to disappear (status becomes "loaded")
    await waitFor(() => {
        const spinnerAfter = screen.queryByRole("status") || document.querySelector(".animate-spin");
        expect(spinnerAfter).toBeNull();
    });
  });

  it("handles images without decode() support", async () => {
    const handleLoad = vi.fn();
    render(
      <LoadingImage
        src="https://example.com/test.jpg"
        onLoad={handleLoad}
      />
    );

    const img = screen.getByRole("img", { hidden: true });
    // Remove decode if it exists (some environments might have it)
    (img as any).decode = undefined;

    fireEvent.load(img);

    expect(handleLoad).toHaveBeenCalled();
    await waitFor(() => {
        const spinner = screen.queryByRole("status") || document.querySelector(".animate-spin");
        expect(spinner).toBeNull();
    });
  });

  it("ignores a stale decode resolution after src changes", async () => {
    // Image A's decode is held pending so we can resolve it *after* src swaps.
    let resolveStaleDecode: () => void;
    const staleDecode = new Promise<void>((resolve) => {
      resolveStaleDecode = resolve;
    });

    const { rerender } = render(<LoadingImage src="https://example.com/a.jpg" />);
    const img = screen.getByRole("img", { hidden: true });
    (img as any).decode = vi.fn().mockReturnValue(staleDecode);

    // A loads but its decode is still pending → spinner stays up.
    fireEvent.load(img);
    expect(screen.queryByRole("status") || document.querySelector(".animate-spin")).not.toBeNull();

    // src changes to B before A finishes decoding; B has not loaded yet.
    rerender(<LoadingImage src="https://example.com/b.jpg" />);

    // A's stale decode finally resolves — the generation guard must drop it so
    // B (still loading) is not falsely revealed.
    resolveStaleDecode!();
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.queryByRole("status") || document.querySelector(".animate-spin")).not.toBeNull();
  });

  it("shows the error state when decode() fails", async () => {
    const onError = vi.fn();
    render(<LoadingImage src="https://example.com/x.jpg" onError={onError} />);

    const img = screen.getByRole("img", { hidden: true });
    (img as any).decode = vi.fn().mockRejectedValue(new Error("decode failed"));

    fireEvent.load(img);

    // A genuine decode failure surfaces the error UI instead of fading in a
    // broken image, and notifies the consumer.
    await waitFor(() => {
      expect(screen.queryByText("Failed to load")).not.toBeNull();
    });
    expect(onError).toHaveBeenCalled();
  });
});

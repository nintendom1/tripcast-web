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
});

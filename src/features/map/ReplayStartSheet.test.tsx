import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ReplayStartSheet from "./ReplayStartSheet";

describe("ReplayStartSheet", () => {
  it("offers every source without starting a fetch on render", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ReplayStartSheet open hasResume onSelect={onSelect} onClose={() => {}} />);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Recent activity/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Continue where you left off/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Start from beginning/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Custom date range/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /Recent activity/ }));
    expect(onSelect).toHaveBeenCalledWith("recent");
  });

  it("disables Continue with an explanation when resume is unavailable", () => {
    render(<ReplayStartSheet open hasResume={false} onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: /Continue where you left off/ })).toBeDisabled();
    expect(screen.getByText("No saved Replay position yet.")).toBeInTheDocument();
  });

  it("keeps choices disabled and exposes loading failures", () => {
    const { rerender } = render(<ReplayStartSheet open hasResume loading onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByText("Loading Replay…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Recent activity/ })).toBeDisabled();
    rerender(<ReplayStartSheet open hasResume error="Backend unavailable" onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Backend unavailable");
  });
});

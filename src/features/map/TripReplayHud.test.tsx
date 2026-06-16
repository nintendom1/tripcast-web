import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TripReplayHud, type TripReplayHudProps } from "./TripReplayHud";

function makeProps(overrides: Partial<TripReplayHudProps> = {}): TripReplayHudProps {
  return {
    playheadIndex: 5,
    endIndex: 10,
    currentPinKind: "breadcrumb",
    currentPinTime: 1_700_000_000_000,
    speed: 1,
    windowLabel: "Full trip",
    isPaused: true,
    onTogglePause: vi.fn(),
    onRestart: vi.fn(),
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    onScrub: vi.fn(),
    onOpenSpeedSheet: vi.fn(),
    onOpenDateSheet: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("TripReplayHud", () => {
  it("disables the Previous button at the start of the timeline", () => {
    render(<TripReplayHud {...makeProps({ playheadIndex: 0 })} />);
    expect(screen.getByRole("button", { name: "Previous pin" })).toBeDisabled();
  });

  it("disables the Next button at end of replay", () => {
    render(<TripReplayHud {...makeProps({ currentPinKind: "end", playheadIndex: 10 })} />);
    expect(screen.getByRole("button", { name: "Next pin" })).toBeDisabled();
  });

  it("invokes onPrevious / onNext when the step buttons are clicked", async () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const user = userEvent.setup();

    render(<TripReplayHud {...makeProps({ onPrevious, onNext })} />);

    await user.click(screen.getByRole("button", { name: "Previous pin" }));
    await user.click(screen.getByRole("button", { name: "Next pin" }));

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("renders the Restart button (not Play/Pause) when the replay has ended", () => {
    render(<TripReplayHud {...makeProps({ currentPinKind: "end" })} />);
    expect(screen.getByRole("button", { name: "Replay from start" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pause replay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /play replay/i })).toBeNull();
    expect(screen.getByText("End of replay")).toBeInTheDocument();
  });
});

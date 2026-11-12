import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../../providers/ThemeProvider";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { TopBar } from "./TopBar";

const chip = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
vi.mock("../trips/TripChip", () => ({
  TripChip: (props: Record<string, unknown>) => {
    chip.props.push(props);
    return null;
  },
}));

beforeEach(() => {
  chip.props = [];
  localStorage.clear();
});

function renderBar(role: "traveler" | "follower", onRequestEndCurrentTrip?: () => void) {
  render(
    <ThemeProvider>
      <TripContextTestProvider value={{ role, multiTripEnabled: true }}>
        <TopBar role={role} onOpenOptions={vi.fn()} onRequestEndCurrentTrip={onRequestEndCurrentTrip} />
      </TripContextTestProvider>
    </ThemeProvider>,
  );
}

describe("TopBar trip chip", () => {
  it("hands the End Trip request for the shared trip to the chip (the card menu's Complete trip)", () => {
    const end = vi.fn();
    renderBar("traveler", end);
    expect(chip.props.at(-1)?.onRequestEndCurrentTrip).toBe(end);
  });

  it("mounts no chip for a Follower", () => {
    renderBar("follower", vi.fn());
    expect(chip.props).toEqual([]);
  });
});

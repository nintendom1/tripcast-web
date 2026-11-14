import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../../providers/ThemeProvider";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { TopBar } from "./TopBar";

const toggle = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
vi.mock("../trips/TripsPaneToggle", () => ({
  TripsPaneToggle: (props: Record<string, unknown>) => {
    toggle.props.push(props);
    return null;
  },
}));

beforeEach(() => {
  toggle.props = [];
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

describe("TopBar Trips pane toggle", () => {
  it("hands the End Trip request for the shared trip to the logo toggle (the card menu's Complete trip)", () => {
    const end = vi.fn();
    renderBar("traveler", end);
    expect(toggle.props.at(-1)?.onRequestEndCurrentTrip).toBe(end);
    expect(toggle.props.at(-1)?.logoClassName).toEqual(expect.stringContaining("font-extrabold"));
  });

  it("mounts no toggle for a Follower", () => {
    renderBar("follower", vi.fn());
    expect(toggle.props).toEqual([]);
  });
});

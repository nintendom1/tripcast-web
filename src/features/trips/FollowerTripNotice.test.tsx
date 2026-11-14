import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EffectiveTrip } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "./tripTypes";
import { FollowerTripNotice } from "./FollowerTripNotice";

const trip = (tripId: string, title: string, lifecycle: EffectiveTrip["lifecycle"] = "in_progress"): EffectiveTrip => ({
  tripId,
  title,
  lifecycle,
  isLegacy: false,
});

function setup(value: Partial<TripContextValue>) {
  const onSwitch = vi.fn();
  const view = render(
    <TripContextTestProvider value={value}>
      <FollowerTripNotice onSwitch={onSwitch} />
    </TripContextTestProvider>,
  );
  const show = (next: Partial<TripContextValue>) =>
    view.rerender(
      <TripContextTestProvider value={next}>
        <FollowerTripNotice onSwitch={onSwitch} />
      </TripContextTestProvider>,
    );
  return { onSwitch, show };
}

afterEach(() => vi.useRealTimers());

describe("FollowerTripNotice", () => {
  it("says nothing at launch, then announces a switch once and asks the shell to close its sheets", () => {
    const { onSwitch, show } = setup({ role: "follower", followerTrip: trip("autumn", "Autumn 2026") });
    expect(screen.queryByRole("status")).toBeNull();
    show({ role: "follower", followerTrip: trip("autumn", "Autumn 2026 (renamed)") });
    expect(screen.queryByRole("status")).toBeNull();
    expect(onSwitch).not.toHaveBeenCalled();

    show({ role: "follower", followerTrip: trip("summer", "Summer 2026") });
    expect(screen.getByRole("status")).toHaveTextContent("The Traveler is now sharing Summer 2026.");
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  it("the notice goes away after a few seconds", async () => {
    vi.useFakeTimers();
    const { show } = setup({ role: "follower", followerTrip: trip("autumn", "Autumn 2026") });
    show({ role: "follower", followerTrip: trip("summer", "Summer 2026") });
    expect(screen.getByRole("status")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a planned trip says it has not started yet", () => {
    setup({ role: "follower", followerTrip: trip("summer", "Summer 2026", "planned") });
    expect(screen.getByRole("status")).toHaveTextContent("Summer 2026 hasn't started yet.");
  });

  it("renders nothing for a Traveler, even when the trip changes or is planned", () => {
    const { onSwitch, show } = setup({ role: "traveler", followerTrip: trip("autumn", "Autumn 2026", "planned") });
    show({ role: "traveler", followerTrip: trip("summer", "Summer 2026", "planned") });
    expect(screen.queryByRole("status")).toBeNull();
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("renders nothing for a Follower before the trip is known", () => {
    const { show } = setup({ role: "follower", followerTrip: null });
    show({ role: "follower", followerTrip: trip("summer", "Summer 2026") });
    expect(screen.queryByRole("status")).toBeNull();
  });
});

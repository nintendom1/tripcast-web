import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getLiveSharingEnabled, setLiveSharingEnabled } from "@/lib/liveSharingPreference";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "./tripTypes";
import { PrivateTripBanner } from "./PrivateTripBanner";

const current = {
  tripId: "autumn",
  title: "Autumn 2026",
  lifecycle: "in_progress" as const,
  isLegacy: false,
  revision: 1,
  publishingEpoch: 1,
  epochStartedAt: 0,
  multiTripEnabled: true,
};

function setup(over: Partial<TripContextValue> = {}) {
  const returnToCurrent = vi.fn();
  render(
    <TripContextTestProvider
      value={{
        multiTripEnabled: true,
        viewingMode: "private",
        viewingTripId: "summer",
        viewingTrip: { tripId: "summer", title: "Summer 2026" },
        currentTrip: current,
        returnToCurrent,
        ...over,
      }}
    >
      <PrivateTripBanner />
    </TripContextTestProvider>,
  );
  return { returnToCurrent };
}

beforeEach(() => setLiveSharingEnabled(false));

describe("PrivateTripBanner", () => {
  it("renders nothing while following the current trip", () => {
    setup({ viewingMode: "follow_current" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders nothing for a Follower", () => {
    setup({ role: "follower" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("not live: names both trips and offers Return to current, with no Stop", async () => {
    const user = userEvent.setup();
    const { returnToCurrent } = setup();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Viewing Summer 2026 privately. Followers are viewing Autumn 2026.",
    );
    expect(screen.queryByText(/Live on/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Return to current" }));
    expect(returnToCurrent).toHaveBeenCalledTimes(1);
  });

  it("live: adds the live trip and a Stop that turns the preference off", async () => {
    const user = userEvent.setup();
    setLiveSharingEnabled(true);
    setup();
    expect(screen.getByText("Live on Autumn 2026")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(getLiveSharingEnabled()).toBe(false);
    expect(screen.queryByText(/Live on/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });

  it("while the shared trip is loading or unavailable it says so quietly instead of naming a trip", () => {
    setLiveSharingEnabled(true);
    setup({ currentTrip: undefined, followerTrip: undefined, serverTripStatus: "loading" });
    expect(screen.getByRole("status")).toHaveTextContent("Viewing Summer 2026 privately.");
    expect(screen.getByRole("status")).not.toHaveTextContent("Followers are viewing");
    expect(screen.getByText("Loading what Followers see…")).toBeInTheDocument();
    expect(screen.queryByText(/Live on/)).not.toBeInTheDocument();
  });

  it("says what is unavailable when the shared trip fails to load", () => {
    setup({ currentTrip: null, followerTrip: null, serverTripStatus: "unavailable" });
    expect(screen.getByText("What Followers see is unavailable right now.")).toBeInTheDocument();
  });

  it("follows a changed shared trip while staying on the viewed one", () => {
    setup({ currentTrip: { ...current, title: "Winter 2026" } });
    expect(screen.getByRole("status")).toHaveTextContent("Viewing Summer 2026 privately. Followers are viewing Winter 2026.");
  });
});

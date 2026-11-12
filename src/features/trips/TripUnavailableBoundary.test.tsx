import { act, render, screen } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { useState, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "./tripTypes";
import { TripUnavailableBoundary } from "./TripUnavailableBoundary";

const SUMMER = { tripId: "summer", title: "Summer 2026" };
const AUTUMN = { tripId: "autumn", title: "Autumn 2026" };
const gone = () => new ConvexError({ code: "trip_not_found", message: "That trip no longer exists." });
const notShared = () => new ConvexError({ code: "trip_not_shared", message: "That trip is not being shared." });

/** Throws `failure()` while the viewed trip is `failsOn`; otherwise names the trip it renders. */
function Content({ tripId, failsOn, failure }: { tripId: string | undefined; failsOn: string | null; failure: () => Error }) {
  if (tripId !== undefined && tripId === failsOn) throw failure();
  return <p>Map of {tripId ?? "no trip"}</p>;
}

/** A real-ish context: `reportTripUnavailable` drops the private view on that trip, as the provider does. */
function Harness({
  start,
  failsOn,
  failure = gone,
  reportsBack = true,
}: {
  start: Partial<TripContextValue>;
  failsOn: string | null;
  failure?: () => Error;
  reportsBack?: boolean;
}) {
  const [value, setValue] = useState<Partial<TripContextValue>>(start);
  const reportTripUnavailable = (tripId: string) => {
    reports.push(tripId);
    if (!reportsBack || value.viewingTripId !== tripId) return;
    setValue((v) => ({ ...v, viewingMode: "follow_current", viewingTripId: AUTUMN.tripId, viewingTrip: AUTUMN }));
  };
  return (
    <TripContextTestProvider value={{ ...value, reportTripUnavailable }}>
      <TripUnavailableBoundary>
        <Content
          tripId={value.role === "follower" ? (value.followerTrip?.tripId ?? undefined) : (value.viewingTripId ?? undefined)}
          failsOn={failsOn}
          failure={failure}
        />
      </TripUnavailableBoundary>
    </TripContextTestProvider>
  );
}
/** Every `reportTripUnavailable` call, in order. */
let reports: string[] = [];

function Outer({ children }: { children: ReactNode }) {
  return <ErrorBoundary fallbackRender={({ error }) => <p role="alert">Map fallback: {(error as Error).message}</p>}>{children}</ErrorBoundary>;
}

const privateSummer: Partial<TripContextValue> = {
  role: "traveler",
  multiTripEnabled: true,
  viewingMode: "private",
  viewingTripId: SUMMER.tripId,
  viewingTrip: SUMMER,
};

beforeEach(() => {
  reports = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TripUnavailableBoundary", () => {
  it("a private view of a trip that is gone returns to the current trip, names the trip and renders again", async () => {
    render(
      <Outer>
        <Harness start={privateSummer} failsOn={SUMMER.tripId} />
      </Outer>,
    );
    expect(await screen.findByText("Map of autumn")).toBeInTheDocument();
    expect(reports).toEqual(["summer"]);
    expect(screen.getByRole("status")).toHaveTextContent("Summer 2026 is no longer available. Showing the current trip.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("any other error goes to the boundary above, as before", async () => {
    render(
      <Outer>
        <Harness start={privateSummer} failsOn={SUMMER.tripId} failure={() => new Error("map exploded")} />
      </Outer>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Map fallback: map exploded");
    expect(reports).toEqual([]);
  });

  it("with multi-trip off it swallows nothing, not even trip_not_found", async () => {
    render(
      <Outer>
        <Harness start={{ ...privateSummer, multiTripEnabled: false }} failsOn={SUMMER.tripId} />
      </Outer>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("That trip no longer exists.");
    expect(reports).toEqual([]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("trip_not_found while following the current trip goes up (only a private view can leave a trip)", async () => {
    render(
      <Outer>
        <Harness
          start={{ ...privateSummer, viewingMode: "follow_current", viewingTripId: AUTUMN.tripId, viewingTrip: AUTUMN }}
          failsOn={AUTUMN.tripId}
        />
      </Outer>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("That trip no longer exists.");
  });

  it("does not loop: when reporting the trip does not leave it, the second failure goes up", async () => {
    render(
      <Outer>
        <Harness start={privateSummer} failsOn={SUMMER.tripId} reportsBack={false} />
      </Outer>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("That trip no longer exists.");
    expect(reports).toEqual(["summer"]);
  });

  it("a Follower's trip_not_shared renders again once, silently; a repeat goes up", async () => {
    const follower: Partial<TripContextValue> = {
      role: "follower",
      followerTrip: { ...AUTUMN, lifecycle: "in_progress", isLegacy: false },
    };
    let failures = 0;
    render(
      <Outer>
        <Harness
          start={follower}
          failsOn={AUTUMN.tripId}
          failure={() => {
            failures += 1;
            return notShared();
          }}
        />
      </Outer>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("That trip is not being shared.");
    // React renders a failing tree twice before a boundary takes over: one retry means two more attempts.
    expect(failures).toBeGreaterThan(2);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("the notice goes away after a few seconds", async () => {
    vi.useFakeTimers();
    render(
      <Outer>
        <Harness start={privateSummer} failsOn={SUMMER.tripId} />
      </Outer>,
    );
    await act(async () => {});
    expect(screen.getByRole("status")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});

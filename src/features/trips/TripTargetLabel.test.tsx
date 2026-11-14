import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "./tripTypes";
import { TripTargetLabel } from "./TripTargetLabel";

const summer = { tripId: "trip-summer", title: "Summer 2026" };

function renderLabel(value: Partial<TripContextValue>, target: typeof summer | null = summer) {
  return render(
    <TripContextTestProvider value={value}>
      <TripTargetLabel target={target} />
    </TripContextTestProvider>,
  );
}

describe("TripTargetLabel", () => {
  it("names the captured trip when multi-trip is on and the device views privately", () => {
    renderLabel({ multiTripEnabled: true, viewingMode: "private" });
    expect(screen.getByText("Summer 2026")).toBeInTheDocument();
  });

  it("renders nothing while multi-trip is disabled", () => {
    renderLabel({ multiTripEnabled: false, viewingMode: "private" });
    expect(screen.queryByTestId("trip-target-label")).toBeNull();
  });

  it("renders nothing when following the current trip", () => {
    renderLabel({ multiTripEnabled: true, viewingMode: "follow_current" });
    expect(screen.queryByTestId("trip-target-label")).toBeNull();
  });

  it("renders nothing without a captured target", () => {
    renderLabel({ multiTripEnabled: true, viewingMode: "private" }, null);
    expect(screen.queryByTestId("trip-target-label")).toBeNull();
  });
});

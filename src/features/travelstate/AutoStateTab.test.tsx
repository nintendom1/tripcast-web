import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import AutoStateTab from "./AutoStateTab";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const baseAutoState = {
  autoStateEnabled: true,
  autoEnabledAt: Date.UTC(2024, 5, 15, 0, 0, 0),
  autoTimeZone: "UTC",
  autoBaseEnergyScore: 60,
  autoBaseStomachScore: 80,
  autoBedtimeMinutes: 23 * 60,
  autoWakeTimeMinutes: 9 * 60,
  autoEnergyMin: 0,
  autoEnergyMax: 100,
  autoStomachMin: 0,
  autoStomachMax: 150,
  autoEnergySleepDeltaPerTick: 1,
  autoEnergyAwakeDeltaPerTick: -1,
  autoStomachAwakeDeltaPerTick: -2,
  autoStomachNightAboveHungryEveryTicks: 2,
  autoStomachNightAtOrBelowHungryEveryTicks: 4,
  updatedAt: Date.UTC(2024, 5, 15, 0, 0, 0),
  updatedBySessionId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2024, 5, 15, 0, 0, 0));
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelerAutoState.travelerGetAutoState) return baseAutoState;
    return undefined;
  });
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn() as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AutoStateTab", () => {
  it("places phase emojis at 24-hour preview boundary points", () => {
    render(<AutoStateTab token="test-token" />);

    const phaseStrip = screen.getByLabelText("24-hour phase strip");
    const nightMarkers = within(phaseStrip).getAllByLabelText("Night");
    const wakeMarker = within(phaseStrip).getByLabelText("Wake");
    const daytimeMarker = within(phaseStrip).getByLabelText("Daytime");

    expect(nightMarkers[0]).toHaveStyle({ left: "0%" });
    expect(wakeMarker).toHaveStyle({ left: "37.5%" });
    expect(daytimeMarker).toHaveStyle({ left: "41.66666666666667%" });
    expect(nightMarkers[1]).toHaveStyle({ left: "95.83333333333334%" });
  });
});

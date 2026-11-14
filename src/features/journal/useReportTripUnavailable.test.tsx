import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { useReportTripUnavailable } from "./useReportTripUnavailable";

const target = { tripId: "B", title: "Trip B" };

function setup() {
  const reportTripUnavailable = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TripContextTestProvider value={{ reportTripUnavailable }}>{children}</TripContextTestProvider>
  );
  return { report: renderHook(() => useReportTripUnavailable(), { wrapper }).result.current, reportTripUnavailable };
}

describe("useReportTripUnavailable", () => {
  it("reports the write's trip when the server says trip_not_found", () => {
    const { report, reportTripUnavailable } = setup();
    report({ data: { code: "trip_not_found", message: "gone" } }, target);
    expect(reportTripUnavailable).toHaveBeenCalledExactlyOnceWith("B");
  });

  it("ignores other errors, plain errors and an untagged write", () => {
    const { report, reportTripUnavailable } = setup();
    report({ data: { code: "trip_mismatch", message: "x" } }, target);
    report(new Error("network"), target);
    report({ data: { code: "trip_not_found", message: "gone" } }, null);
    expect(reportTripUnavailable).not.toHaveBeenCalled();
  });

  it("is safe with no provider", () => {
    const { result } = renderHook(() => useReportTripUnavailable());
    expect(() => result.current({ data: { code: "trip_not_found", message: "gone" } }, target)).not.toThrow();
  });
});

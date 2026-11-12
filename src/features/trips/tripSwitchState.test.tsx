import { act, render, screen } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it } from "vitest";

import { beginSwitch, endSwitch, getSwitchPending, setSwitchPending, tripErrorInfo, useSwitchPending } from "./tripSwitchState";

function Probe() {
  return <p>{useSwitchPending() ? "pending" : "idle"}</p>;
}

afterEach(() => setSwitchPending(false));

describe("switch pending flag", () => {
  it("notifies subscribers when it is set and cleared", () => {
    render(<Probe />);
    expect(screen.getByText("idle")).toBeInTheDocument();
    act(() => setSwitchPending(true));
    expect(getSwitchPending()).toBe(true);
    expect(screen.getByText("pending")).toBeInTheDocument();
    act(() => setSwitchPending(false));
    expect(screen.getByText("idle")).toBeInTheDocument();
  });
});

describe("switch request tokens", () => {
  it("an answer clears only its own request", () => {
    const first = beginSwitch("a");
    endSwitch(first);
    expect(getSwitchPending()).toBe(false);
    const second = beginSwitch("c");
    // A late answer for the first request must not clear the second.
    endSwitch(first);
    expect(getSwitchPending()).toBe(true);
    endSwitch(second);
    expect(getSwitchPending()).toBe(false);
  });
});

describe("tripErrorInfo", () => {
  it("reads code and message from a ConvexError", () => {
    expect(tripErrorInfo(new ConvexError({ code: "trip_revision_conflict", message: "Reload." }))).toEqual({
      code: "trip_revision_conflict",
      message: "Reload.",
    });
  });

  it("reads a plain ConvexError string and falls back otherwise", () => {
    expect(tripErrorInfo(new ConvexError("Trip title is required."))).toEqual({
      code: null,
      message: "Trip title is required.",
    });
    expect(tripErrorInfo(new Error("boom"), "fallback")).toEqual({ code: null, message: "boom" });
    expect(tripErrorInfo(undefined, "fallback")).toEqual({ code: null, message: "fallback" });
  });

  it("knows trip_mismatch", () => {
    expect(tripErrorInfo(new Error("Uncaught trip_mismatch"), "fallback").code).toBe("trip_mismatch");
  });

  it("finds a code inside a stringified server error", () => {
    expect(tripErrorInfo(new Error("[Request ID: x] Server Error Uncaught trip_not_found"), "fallback")).toEqual({
      code: "trip_not_found",
      message: "fallback",
    });
  });
});

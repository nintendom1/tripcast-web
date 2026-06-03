import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  MovementDebugProvider,
  useMovementDebugRecords,
  useMovementDebugSpeed,
  type MovementDebugRecordsContextValue,
  type MovementDebugSpeedContextValue,
} from "./MovementDebugProvider";

const STORAGE_KEY = "tripcast:movementDebug";

beforeEach(() => {
  localStorage.clear();
});

function captureContexts(captures: {
  records?: MovementDebugRecordsContextValue;
  speed?: MovementDebugSpeedContextValue;
}) {
  function Probe() {
    captures.records = useMovementDebugRecords();
    captures.speed = useMovementDebugSpeed();
    return null;
  }
  render(
    <MovementDebugProvider>
      <Probe />
    </MovementDebugProvider>,
  );
}

describe("MovementDebugProvider", () => {
  it("starts with empty records and calibration off", () => {
    const c: { records?: MovementDebugRecordsContextValue } = {};
    captureContexts(c);
    expect(c.records?.isCalibrationModeEnabled).toBe(false);
    expect(c.records?.lastTriggeredWalking).toBeNull();
    expect(c.records?.lastTriggeredMoving).toBeNull();
    expect(c.records?.lastAlmostTriggeredWalking).toBeNull();
    expect(c.records?.lastAlmostTriggeredMoving).toBeNull();
  });

  it("persists calibration toggle to localStorage", () => {
    const c: { records?: MovementDebugRecordsContextValue } = {};
    captureContexts(c);
    act(() => c.records?.setCalibrationEnabled(true));
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(raw.isCalibrationModeEnabled).toBe(true);
  });

  it("routes recordTriggered to the slot matching `to`", () => {
    const c: { records?: MovementDebugRecordsContextValue } = {};
    captureContexts(c);
    act(() =>
      c.records?.recordTriggered({ from: "stopped", to: "walking", speedMps: 1.2 }),
    );
    act(() =>
      c.records?.recordTriggered({ from: "walking", to: "moving", speedMps: 9.5 }),
    );
    expect(c.records?.lastTriggeredWalking?.speedMps).toBe(1.2);
    expect(c.records?.lastTriggeredWalking?.from).toBe("stopped");
    expect(c.records?.lastTriggeredMoving?.speedMps).toBe(9.5);
    expect(c.records?.lastTriggeredMoving?.from).toBe("walking");
  });

  it("routes recordAlmostTriggered to the slot matching thresholdType", () => {
    const c: { records?: MovementDebugRecordsContextValue } = {};
    captureContexts(c);
    act(() =>
      c.records?.recordAlmostTriggered({ thresholdType: "walking", speedMps: 0.85, thresholdMps: 0.894 }),
    );
    act(() =>
      c.records?.recordAlmostTriggered({ thresholdType: "moving", speedMps: 8.5, thresholdMps: 8.94 }),
    );
    expect(c.records?.lastAlmostTriggeredWalking?.thresholdMps).toBeCloseTo(0.894, 3);
    expect(c.records?.lastAlmostTriggeredMoving?.thresholdMps).toBeCloseTo(8.94, 2);
  });

  it("hydrates persisted records on next mount", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        isCalibrationModeEnabled: true,
        lastTriggeredWalking: { timestamp: 123, from: "stopped", to: "walking", speedMps: 1.1 },
      }),
    );
    const c: { records?: MovementDebugRecordsContextValue } = {};
    captureContexts(c);
    expect(c.records?.isCalibrationModeEnabled).toBe(true);
    expect(c.records?.lastTriggeredWalking?.speedMps).toBe(1.1);
  });

  it("clears live speed when calibration is disabled", () => {
    const c: {
      records?: MovementDebugRecordsContextValue;
      speed?: MovementDebugSpeedContextValue;
    } = {};
    captureContexts(c);
    act(() => c.records?.setCalibrationEnabled(true));
    act(() => c.speed?.recordCurrentSpeed(2.3));
    expect(c.speed?.currentSpeedMps).toBe(2.3);
    act(() => c.records?.setCalibrationEnabled(false));
    expect(c.speed?.currentSpeedMps).toBeNull();
  });

  it("returns safe fallbacks when used without a provider", () => {
    function Probe() {
      const records = useMovementDebugRecords();
      const speed = useMovementDebugSpeed();
      expect(records.isCalibrationModeEnabled).toBe(false);
      expect(speed.currentSpeedMps).toBeNull();
      // Setters are no-ops but must be callable
      records.setCalibrationEnabled(true);
      speed.recordCurrentSpeed(5);
      return null;
    }
    render(<Probe />);
  });
});

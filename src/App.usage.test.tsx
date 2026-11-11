import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { UsageLedger } from "./lib/usageWarning";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  getStoredSession: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useConvex: vi.fn(() => ({ query: vi.fn(), mutation: vi.fn(), action: vi.fn() })),
  useMutation: mocks.useMutation,
  useQuery: mocks.useQuery,
  ConvexProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./lib/auth", () => ({
  getStoredSession: mocks.getStoredSession,
  clearStoredSession: vi.fn(),
  setStoredSession: vi.fn(),
}));

vi.mock("./features/map/TripMap", () => ({
  default: () => <div data-testid="trip-map" />,
}));

vi.mock("./features/followers/FollowerManagementPanel", () => ({
  default: () => <div data-testid="follower-panel" />,
}));

// The TripCast iOS app: only the callers outside locationWatcher see it, so no other native call starts.
vi.mock("./native/locationWatcher", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./native/locationWatcher")>()),
  isAdaptiveLocationAvailable: () => true,
}));

const WARN_TOAST = /^Warning: Estimated Database I\/O is past 70%/;

// 160,000 uploads is 72% of the Free plan. No buckets, so no pace: the level does not depend on the clock.
const WARN_LEDGER: UsageLedger = {
  buckets: [],
  policy: {
    emissionIntervalSeconds: 15,
    maxBatchSize: 20,
    maxQueueDepth: 10_000,
    minEmissionIntervalSeconds: 3,
    heartbeatIntervalSeconds: 60,
    minDistanceMeters: 10,
    minBearingDistanceMeters: 3,
    turnThresholdDegrees: 18,
  },
  estimate: { monthKey: "2026-11", uploads: 160_000, bytes: 720_000_000, limitBytes: 1_000_000_000, paused: false },
};
const RESET_LEDGER: UsageLedger = {
  ...WARN_LEDGER,
  estimate: { ...WARN_LEDGER.estimate, uploads: 0, bytes: 0 },
};

/**
 * App keeps the last toast key in module state, so each test loads a fresh copy of App and of
 * the modules it shares state with.
 */
async function loadApp(role: "traveler" | "follower") {
  vi.resetModules();
  mocks.getStoredSession.mockReturnValue({ token: "test-token", role, sessionType: "legacy" as const });
  mocks.useQuery.mockReturnValue({ role });
  mocks.useMutation.mockReturnValue(vi.fn());

  // Toasts are counted by their usage:warning:shown log line, which the gps-trace preset records.
  const debug = await import("./debug/debugLogger");
  debug.setEnabled(true);
  debug.setConsoleMirror(false);
  debug.setPreset("gps-trace");
  const { nativeLocationManager } = await import("./native/nativeLocationManager");
  const getUsageLedger = vi.spyOn(nativeLocationManager, "getUsageLedger").mockResolvedValue(WARN_LEDGER);
  const resetUsageLedger = vi.spyOn(nativeLocationManager, "resetUsageLedger").mockResolvedValue(RESET_LEDGER);
  const { default: App } = await import("./App");

  render(<App convexReady={true} />);
  return {
    getUsageLedger,
    resetUsageLedger,
    warningsShown: () => debug.getLogs().filter((entry) => entry.action === "usage:warning:shown").length,
    /** Returns to the foreground and waits until App has handled the read it starts. */
    returnToForeground: async () => {
      const reads = getUsageLedger.mock.calls.length;
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        await getUsageLedger.mock.results[reads]?.value;
      });
      expect(getUsageLedger).toHaveBeenCalledTimes(reads + 1);
    },
  };
}

// Loading App for the first time is slow when the whole suite is running. Pay for it here, so
// the fresh copies the tests load come from the transform cache and stay inside their timeout.
beforeAll(async () => {
  await import("./App");
}, 120_000);

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("App: Convex usage toast", () => {
  it("toasts a Traveler at warn once across two reads", async () => {
    const { warningsShown, returnToForeground } = await loadApp("traveler");

    expect(await screen.findByText(WARN_TOAST)).toBeInTheDocument();
    await returnToForeground();

    expect(warningsShown()).toBe(1);
  }, 30_000);

  it("never reads the phone's counters or toasts for a Follower", async () => {
    const { getUsageLedger, warningsShown } = await loadApp("follower");

    expect(await screen.findByRole("button", { name: /options/i })).toBeInTheDocument();
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(getUsageLedger).not.toHaveBeenCalled();
    expect(screen.queryByText(WARN_TOAST)).not.toBeInTheDocument();
    expect(warningsShown()).toBe(0);
  }, 30_000);

  it("toasts again after the counters are reset", async () => {
    const { resetUsageLedger, warningsShown, returnToForeground } = await loadApp("traveler");
    expect(await screen.findByText(WARN_TOAST)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    await userEvent.click(screen.getByRole("button", { name: /convex usage:/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Reset counters" }));
    const confirm = await screen.findByRole("dialog", { name: "Reset usage counters?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Reset counters" }));
    await act(async () => {
      await resetUsageLedger.mock.results[0]?.value;
    });
    expect(warningsShown()).toBe(1);

    await returnToForeground();

    expect(warningsShown()).toBe(2);
  }, 30_000);
});

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { UsageLedger, UsageLedgerBucket } from "./lib/usageWarning";

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
// 10,000 uploads is 4.5% of the Free plan: only a resource the test pushes up can leave ok.
const QUIET_LEDGER: UsageLedger = {
  ...WARN_LEDGER,
  estimate: { ...WARN_LEDGER.estimate, uploads: 10_000, bytes: 45_000_000 },
};

// 430,000 uploads is past 90% of Database I/O and 71% of Function Calls (1.65 calls each).
const BIG_LEDGER: UsageLedger = {
  ...WARN_LEDGER,
  estimate: { ...WARN_LEDGER.estimate, uploads: 430_000, bytes: 1_935_000_000 },
};

const MB = 1_000_000;
const HOUR_MS = 60 * 60 * 1000;
const BASELINES_KEY = "tripcast.usageBaselines.v1";

/** The egress meter and the toast keys use the clock when they load, so seed them for the real month. */
function seedPhotoEgress(bytes: number) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  localStorage.setItem("tripcast.egressMeter.v1", JSON.stringify({ month, sizes: { "image-1": bytes } }));
}

function bucketAt(hourStart: number, samplesAcked: number): UsageLedgerBucket {
  return {
    hourStart,
    requests: 1,
    uploads: 1,
    samplesSent: samplesAcked,
    samplesAcked,
    bytesSent: 0,
    bytesReceived: 0,
    retries: 0,
    failures: { network: 0, server: 0, rateLimited: 0, auth: 0, paused: 0, rejected: 0 },
    samplesSetAside: 0,
    samplesThinned: 0,
    secondsByMode: {},
  };
}

function storedBaselines(): { baselines: { database?: { foldedPoints: number; foldedThroughHourMs: number } } } {
  return JSON.parse(localStorage.getItem(BASELINES_KEY) ?? '{"baselines":{}}');
}

/**
 * App keeps the last toast key in module state, so each test loads a fresh copy of App and of
 * the modules it shares state with.
 */
async function loadApp(role: "traveler" | "follower", ledger: UsageLedger = WARN_LEDGER) {
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
  const getUsageLedger = vi.spyOn(nativeLocationManager, "getUsageLedger").mockResolvedValue(ledger);
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

afterEach(() => {
  vi.useRealTimers();
});

/** Opens Options and the Convex Usage screen, whose row is `row` (the status line when a level shows). */
async function openConvexUsage(row: RegExp) {
  await userEvent.click(screen.getByRole("button", { name: /options/i }));
  await userEvent.click(screen.getByRole("button", { name: row }));
  return screen.findByRole("button", { name: "Reset counters" });
}

async function confirmReset(resetButton: HTMLElement, resetUsageLedger: { mock: { results: Array<{ value: unknown }> } }) {
  await userEvent.click(resetButton);
  const confirm = await screen.findByRole("dialog", { name: "Reset usage counters?" });
  await userEvent.click(within(confirm).getByRole("button", { name: "Reset counters" }));
  await waitFor(() => expect(resetUsageLedger.mock.results).toHaveLength(1));
  await act(async () => {
    await resetUsageLedger.mock.results[0]?.value;
  });
}

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
  it("toasts a resource other than Database I/O once, naming it", async () => {
    seedPhotoEgress(950 * MB);
    const { warningsShown, returnToForeground } = await loadApp("traveler", QUIET_LEDGER);

    expect(await screen.findByText("Critical: Estimated Data Egress is past 90% of the Free plan.")).toBeInTheDocument();
    await returnToForeground();

    expect(warningsShown()).toBe(1);
  }, 30_000);

  it("toasts one escalation per read, the most severe first", async () => {
    seedPhotoEgress(950 * MB);
    const { warningsShown, returnToForeground } = await loadApp("traveler");

    // Database I/O is at warn and Data Egress at critical: the critical one goes first.
    expect(await screen.findByText(/^Critical: Estimated Data Egress/)).toBeInTheDocument();
    expect(screen.queryByText(WARN_TOAST)).not.toBeInTheDocument();
    expect(warningsShown()).toBe(1);

    await returnToForeground();
    expect(await screen.findByText(WARN_TOAST)).toBeInTheDocument();
    expect(warningsShown()).toBe(2);

    await returnToForeground();
    expect(warningsShown()).toBe(2);
  }, 30_000);

  it("does not toast Data Egress again when the GPS counters are reset", async () => {
    seedPhotoEgress(950 * MB);
    const { resetUsageLedger, warningsShown, returnToForeground } = await loadApp("traveler", QUIET_LEDGER);
    expect(await screen.findByText(/^Critical: Estimated Data Egress/)).toBeInTheDocument();

    await confirmReset(await openConvexUsage(/convex usage:/i), resetUsageLedger);
    await returnToForeground();

    expect(warningsShown()).toBe(1);
  }, 30_000);

  it("toasts Function Calls again after the counters are reset", async () => {
    const { resetUsageLedger, warningsShown, returnToForeground } = await loadApp("traveler", BIG_LEDGER);
    expect(await screen.findByText(/^Critical: Estimated Database I\/O/)).toBeInTheDocument();
    await returnToForeground();
    expect(await screen.findByText("Warning: Estimated Function Calls is past 70% of the Free plan.")).toBeInTheDocument();
    await returnToForeground();
    expect(warningsShown()).toBe(2);

    await confirmReset(await openConvexUsage(/convex usage:/i), resetUsageLedger);
    expect(warningsShown()).toBe(2);

    // The reset cleared both keys: the next reads toast Database I/O, then Function Calls, once more.
    await returnToForeground();
    await returnToForeground();
    expect(warningsShown()).toBe(4);
  }, 30_000);

  it("keeps each resource's toast key when another resource is toasted", async () => {
    seedPhotoEgress(950 * MB);
    localStorage.setItem(
      BASELINES_KEY,
      JSON.stringify({
        baselines: { file: { bytes: 750 * MB, enteredAtMs: 1, addedBytes: 0 } },
        fileMonth: { month: new Date().toISOString().slice(0, 7), bytes: 0 },
      }),
    );
    const { warningsShown, returnToForeground } = await loadApp("traveler", QUIET_LEDGER);

    // Data Egress at critical goes first, then File Storage at warn, then neither again.
    expect(await screen.findByText(/^Critical: Estimated Data Egress/)).toBeInTheDocument();
    await returnToForeground();
    expect(await screen.findByText(/^Warning: Estimated File Storage/)).toBeInTheDocument();
    await returnToForeground();

    expect(warningsShown()).toBe(2);
  }, 30_000);

  it("reads No estimate on this device, and does not toast, when the phone's month is unreadable", async () => {
    seedPhotoEgress(950 * MB);
    const { warningsShown } = await loadApp("traveler", {
      ...QUIET_LEDGER,
      estimate: { ...QUIET_LEDGER.estimate, monthKey: "not-a-month" },
    });

    await userEvent.click(await screen.findByRole("button", { name: /options/i }));

    expect(await screen.findByText("No estimate on this device")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /convex usage:/i })).not.toBeInTheDocument();
    expect(warningsShown()).toBe(0);
  }, 30_000);

  describe("reset after the screen has been open for hours", () => {
    const hour = (h: number) => Date.UTC(2026, 10, 18, h);
    // The screen opens at 10:40 with the hour that is open then; by the reset at 13:40 the phone has counted more.
    const OPENED = { ...QUIET_LEDGER, buckets: [bucketAt(hour(10), 300)] };
    const LATER = {
      ...QUIET_LEDGER,
      buckets: [bucketAt(hour(10), 300), bucketAt(hour(11), 720), bucketAt(hour(12), 720), bucketAt(hour(13), 360)],
    };

    async function openAt1040AndReturnAt1340() {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(hour(10) + 40 * 60_000);
      localStorage.setItem(
        BASELINES_KEY,
        JSON.stringify({
          baselines: { database: { bytes: 10 * MB, enteredAtMs: hour(10), foldedThroughHourMs: hour(10), foldedPoints: 0 } },
          fileMonth: { month: "2026-11", bytes: 0 },
        }),
      );
      const app = await loadApp("traveler", OPENED);
      const resetButton = await openConvexUsage(/convex usage/i);
      vi.setSystemTime(hour(13) + 40 * 60_000);
      return { ...app, resetButton };
    }

    it("counts the hours since it opened, from a fresh read, in the baseline", async () => {
      const { getUsageLedger, resetUsageLedger, resetButton } = await openAt1040AndReturnAt1340();
      getUsageLedger.mockResolvedValue(LATER);

      await confirmReset(resetButton, resetUsageLedger);

      const database = storedBaselines().baselines.database;
      expect(database?.foldedPoints).toBe(2100);
      expect(database?.foldedThroughHourMs).toBe(hour(14));
    }, 30_000);

    it("folds the last ledger it has, and still resets, when the fresh read fails", async () => {
      const { getUsageLedger, resetUsageLedger, resetButton } = await openAt1040AndReturnAt1340();
      getUsageLedger.mockRejectedValue(new Error("read failed"));

      await confirmReset(resetButton, resetUsageLedger);

      expect(storedBaselines().baselines.database?.foldedPoints).toBe(300);
      expect(resetUsageLedger).toHaveBeenCalledTimes(1);
    }, 30_000);
  });

  it("shows a Follower only the photo downloads: no resources, form, read or toast", async () => {
    seedPhotoEgress(950 * MB);
    localStorage.setItem(
      BASELINES_KEY,
      JSON.stringify({
        baselines: { file: { bytes: 900 * MB, enteredAtMs: 1, addedBytes: 0 } },
        fileMonth: { month: new Date().toISOString().slice(0, 7), bytes: 950 * MB },
      }),
    );
    const { getUsageLedger, warningsShown } = await loadApp("follower");

    await userEvent.click(await screen.findByRole("button", { name: /options/i }));
    await userEvent.click(await screen.findByRole("button", { name: /convex usage/i }));

    expect(await screen.findByText("Photo downloads this month")).toBeInTheDocument();
    expect(document.querySelector("[data-usage-resource]")).toBeNull();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Free allowance")).not.toBeInTheDocument();
    expect(getUsageLedger).not.toHaveBeenCalled();
    expect(warningsShown()).toBe(0);
  }, 30_000);

  it("folds each read into the dashboard baseline, and the open hour too just before the counters are reset", async () => {
    const hourStart = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
    localStorage.setItem(
      BASELINES_KEY,
      JSON.stringify({
        baselines: {
          database: { bytes: 10 * MB, enteredAtMs: hourStart - 2 * HOUR_MS, foldedThroughHourMs: hourStart - 2 * HOUR_MS, foldedPoints: 5 },
        },
        fileMonth: { month: new Date().toISOString().slice(0, 7), bytes: 0 },
      }),
    );
    const { resetUsageLedger } = await loadApp("traveler", {
      ...QUIET_LEDGER,
      buckets: [bucketAt(hourStart - HOUR_MS, 40), bucketAt(hourStart, 700)],
    });
    // A plain read folds finished hours only: the open hour is still growing.
    await waitFor(() => expect(storedBaselines().baselines.database?.foldedPoints).toBe(45));

    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    await userEvent.click(screen.getByRole("button", { name: /convex usage/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Reset counters" }));
    const confirm = await screen.findByRole("dialog", { name: "Reset usage counters?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Reset counters" }));
    await act(async () => {
      await resetUsageLedger.mock.results[0]?.value;
    });

    const database = storedBaselines().baselines.database;
    expect(database?.foldedPoints).toBe(745);
    expect(database?.foldedThroughHourMs).toBeGreaterThan(hourStart);
  }, 30_000);

  it("clears the dashboard baselines when the trip data is deleted", async () => {
    localStorage.setItem(
      BASELINES_KEY,
      JSON.stringify({
        baselines: {
          database: { bytes: MB, enteredAtMs: 1, foldedThroughHourMs: 0, foldedPoints: 0 },
          file: { bytes: MB, enteredAtMs: 1, addedBytes: 0 },
        },
        fileMonth: { month: new Date().toISOString().slice(0, 7), bytes: 0 },
      }),
    );
    await loadApp("traveler", QUIET_LEDGER);

    await userEvent.click(await screen.findByRole("button", { name: /options/i }));
    await userEvent.click(await screen.findByRole("button", { name: /emergency reset/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete Shared Trip Data" }));
    await userEvent.click(await screen.findByRole("button", { name: "Confirm shared data deletion" }));

    await waitFor(() => expect(storedBaselines().baselines).toEqual({}));
  }, 30_000);
});

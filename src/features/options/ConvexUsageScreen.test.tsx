import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { newDatabaseBaseline, newFileBaseline, type UsageResource } from "../../lib/usageResources";
import { USAGE_GUARD, USAGE_STORAGE_MODEL, type UsageLedger } from "../../lib/usageWarning";
import { ConvexUsageScreen, type ConvexUsageScreenProps } from "./ConvexUsageScreen";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 18, 15, 0);

// 200,000 uploads is 90% of the Free plan; counters cover the whole month.
const LEDGER: UsageLedger = {
  buckets: [
    {
      hourStart: Date.UTC(2026, 10, 1) - DAY_MS,
      requests: 1,
      uploads: 1,
      samplesSent: 10,
      samplesAcked: 10,
      bytesSent: 0,
      bytesReceived: 0,
      retries: 0,
      failures: { network: 0, server: 0, rateLimited: 0, auth: 0, paused: 0, rejected: 0 },
      samplesSetAside: 0,
      samplesThinned: 0,
      secondsByMode: { precise: 3600 },
    },
  ],
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
  estimate: {
    monthKey: "2026-11",
    uploads: 200_000,
    bytes: 200_000 * USAGE_GUARD.bytesPerUpload,
    limitBytes: USAGE_GUARD.monthlyLimitBytes,
    paused: false,
  },
};

const MB = 1_000_000;
// 10,000 uploads is 4.5% of the Free plan, so only the resource under test can leave ok.
const QUIET_LEDGER: UsageLedger = {
  ...LEDGER,
  estimate: { ...LEDGER.estimate, uploads: 10_000, bytes: 10_000 * USAGE_GUARD.bytesPerUpload },
};

function renderScreen(role: "traveler" | "follower", overrides: Partial<ConvexUsageScreenProps> = {}) {
  return render(
    <ConvexUsageScreen
      role={role}
      ledger={LEDGER}
      storageModel={USAGE_STORAGE_MODEL}
      photoEgressBytes={18.4 * 1024 * 1024}
      nowMs={NOW}
      uploadsPaused={false}
      onResetCounters={vi.fn()}
      {...overrides}
    />,
  );
}

function resourceRow(container: HTMLElement, resource: UsageResource): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[data-usage-resource="${resource}"]`);
  if (!found) throw new Error(`no ${resource} row`);
  return found;
}

describe("ConvexUsageScreen", () => {
  it("shows a Follower only the photo download estimate", () => {
    const { container } = renderScreen("follower");

    expect(screen.getByText("Photo downloads this month")).toBeInTheDocument();
    expect(screen.getByText("≈ 18.4 MB image data loaded on this device")).toBeInTheDocument();
    expect(screen.queryByText("Estimated Database I/O (this phone)")).not.toBeInTheDocument();
    expect(screen.queryByText("Observed (this phone)")).not.toBeInTheDocument();
    expect(screen.queryByText("GPS point storage this month")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset counters" })).not.toBeInTheDocument();
    expect(container.querySelector("[data-usage-estimate]")).toBeNull();
    expect(screen.queryByText("Critical")).not.toBeInTheDocument();
  });

  it("gives a Follower no resource rows, allowances, form or notes", () => {
    const { container } = renderScreen("follower", {
      baselines: { database: newDatabaseBaseline(100 * MB, NOW), file: newFileBaseline(100 * MB, NOW) },
      fileBytesAddedThisMonth: 950 * MB,
      onSaveBaseline: vi.fn(),
    });

    expect(container.querySelector("[data-usage-resource]")).toBeNull();
    expect(screen.queryByText("Free allowance")).not.toBeInTheDocument();
    expect(screen.queryByText(/Action Compute and Search/)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(container.querySelector('[role="meter"], [style*="width"]')).toBeNull();
  });

  it("shows a Traveler the estimated percent of the Free plan", () => {
    const { container } = renderScreen("traveler");

    const estimate = container.querySelector<HTMLElement>("[data-usage-estimate]");
    expect(estimate).not.toBeNull();
    expect(within(estimate!).getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Estimated Database I/O (this phone)")).toBeInTheDocument();
    expect(screen.getByText("Observed (this phone)")).toBeInTheDocument();
    expect(screen.getByText("Database Storage")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset counters" })).toBeInTheDocument();
  });

  it("lists the other four resources with an amount and their Free allowance, and the unused ones", () => {
    const { container } = renderScreen("traveler");

    const allowances: Array<[UsageResource, string]> = [
      ["functionCalls", "1,000,000 calls a month"],
      ["databaseStorage", "500 MB total"],
      ["fileStorage", "1 GB total"],
      ["dataEgress", "1 GB a month"],
    ];
    for (const [resource, allowance] of allowances) {
      const row = resourceRow(container, resource);
      expect(within(row).getByText("Free allowance").nextElementSibling).toHaveTextContent(allowance);
      expect(row.querySelector("[aria-hidden] > div[style]")).not.toBeNull();
    }
    expect(container.querySelectorAll("[data-usage-resource]")).toHaveLength(4);
    expect(screen.getByText("Action Compute and Search are not used by TripCast.")).toBeInTheDocument();
  });

  it("estimates Function Calls as this month's uploads times 1.65", () => {
    const { container } = renderScreen("traveler");

    const row = resourceRow(container, "functionCalls");
    expect(within(row).getByText("Estimated").nextElementSibling).toHaveTextContent("330,000");
    expect(within(row).getByText("33%")).toBeInTheDocument();
  });

  it("shows a Data Egress meter from the photos this device loaded", () => {
    const { container } = renderScreen("traveler", { ledger: QUIET_LEDGER, photoEgressBytes: 950 * MB });

    const row = resourceRow(container, "dataEgress");
    expect(within(row).getByText("95%")).toBeInTheDocument();
    expect(within(row).getByText("Critical")).toBeInTheDocument();
    expect(within(row).getByText("Estimated Data Egress is past 90% of the Free plan.")).toBeInTheDocument();
  });

  it("gives a storage row with no dashboard figure no level and invites entering it", () => {
    const { container } = renderScreen("traveler", {
      ledger: QUIET_LEDGER,
      fileBytesAddedThisMonth: 950 * MB,
      onSaveBaseline: vi.fn(),
    });

    const row = resourceRow(container, "fileStorage");
    expect(within(row).getByText("Added this month").nextElementSibling).toHaveTextContent("950 MB");
    expect(within(row).queryByText("Critical")).not.toBeInTheDocument();
    expect(within(row).queryByText(/%$/)).not.toBeInTheDocument();
    expect(row.querySelector("[data-usage-baseline]")).toBeNull();
    expect(within(row).getByText(/Enter the figure from the Convex dashboard/)).toBeInTheDocument();
  });

  it("levels a storage row from the dashboard figure plus what this phone added since", () => {
    const entered = Date.UTC(2026, 10, 10, 12);
    const { container } = renderScreen("traveler", {
      ledger: QUIET_LEDGER,
      baselines: {
        file: { ...newFileBaseline(800 * MB, entered), addedBytes: 150 * MB },
        database: { ...newDatabaseBaseline(100 * MB, entered), foldedPoints: 100_000 },
      },
      onSaveBaseline: vi.fn(),
    });

    const file = resourceRow(container, "fileStorage");
    expect(within(file).getByText("Estimated").nextElementSibling).toHaveTextContent("950 MB");
    expect(within(file).getByText("95%")).toBeInTheDocument();
    expect(within(file).getByText("Critical")).toBeInTheDocument();
    expect(within(file).getByText("Added by this phone since").nextElementSibling).toHaveTextContent("150 MB");
    const enteredOn = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(entered);
    expect(file.querySelector("[data-usage-baseline]")).toHaveTextContent(`Entered ${enteredOn} from dashboard`);

    const database = resourceRow(container, "databaseStorage");
    expect(within(database).getByText("Estimated").nextElementSibling).toHaveTextContent("141 MB");
    expect(within(database).queryByText("Critical")).not.toBeInTheDocument();
  });

  it("shows the dashboard figure form on the two storage rows only when it can be saved", () => {
    const { container, rerender } = renderScreen("traveler");

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    rerender(
      <ConvexUsageScreen
        role="traveler"
        ledger={LEDGER}
        storageModel={USAGE_STORAGE_MODEL}
        photoEgressBytes={0}
        nowMs={NOW}
        uploadsPaused={false}
        onResetCounters={vi.fn()}
        onSaveBaseline={vi.fn()}
      />,
    );

    expect(within(resourceRow(container, "databaseStorage")).getByRole("textbox")).toBeInTheDocument();
    expect(within(resourceRow(container, "fileStorage")).getByRole("textbox")).toBeInTheDocument();
    expect(within(resourceRow(container, "functionCalls")).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(resourceRow(container, "dataEgress")).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("saves a dashboard figure in bytes, in MB or GB, and again at any time", async () => {
    const onSaveBaseline = vi.fn();
    const { container } = renderScreen("traveler", { onSaveBaseline });

    const database = resourceRow(container, "databaseStorage");
    await userEvent.type(within(database).getByRole("textbox"), "120.5");
    await userEvent.click(within(database).getByRole("button", { name: "Save" }));
    expect(onSaveBaseline).toHaveBeenLastCalledWith("database", 120_500_000);

    const file = resourceRow(container, "fileStorage");
    await userEvent.type(within(file).getByRole("textbox"), "1.5");
    await userEvent.selectOptions(within(file).getByRole("combobox"), "GB");
    await userEvent.click(within(file).getByRole("button", { name: "Save" }));
    expect(onSaveBaseline).toHaveBeenLastCalledWith("file", 1_500_000_000);
    expect(onSaveBaseline).toHaveBeenCalledTimes(2);
  });

  it("rejects a figure that is not a number and saves nothing", async () => {
    const onSaveBaseline = vi.fn();
    const { container } = renderScreen("traveler", { onSaveBaseline });

    const database = resourceRow(container, "databaseStorage");
    await userEvent.type(within(database).getByRole("textbox"), "12 MB");
    await userEvent.click(within(database).getByRole("button", { name: "Save" }));

    expect(within(database).getByRole("alert")).toHaveTextContent("Enter a number");
    expect(onSaveBaseline).not.toHaveBeenCalled();
  });
});

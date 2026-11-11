import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { USAGE_GUARD, USAGE_STORAGE_MODEL, type UsageLedger } from "../../lib/usageWarning";
import { ConvexUsageScreen } from "./ConvexUsageScreen";

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

function renderScreen(role: "traveler" | "follower") {
  return render(
    <ConvexUsageScreen
      role={role}
      ledger={LEDGER}
      storageModel={USAGE_STORAGE_MODEL}
      photoEgressBytes={18.4 * 1024 * 1024}
      nowMs={NOW}
      uploadsPaused={false}
      onResetCounters={vi.fn()}
    />,
  );
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

  it("shows a Traveler the estimated percent of the Free plan", () => {
    const { container } = renderScreen("traveler");

    const estimate = container.querySelector<HTMLElement>("[data-usage-estimate]");
    expect(estimate).not.toBeNull();
    expect(within(estimate!).getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Estimated Database I/O (this phone)")).toBeInTheDocument();
    expect(screen.getByText("Observed (this phone)")).toBeInTheDocument();
    expect(screen.getByText("GPS point storage this month")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset counters" })).toBeInTheDocument();
  });
});

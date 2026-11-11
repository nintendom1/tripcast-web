import { describe, expect, it } from "vitest";
import {
  MIN_PACE_ELAPSED_MS,
  USAGE_GUARD,
  assessUsage,
  isUsageEscalation,
  usageToastKey,
  type UsageLedger,
  type UsageLedgerBucket,
} from "./usageWarning";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MONTH_START = Date.UTC(2026, 10, 1);
const AS_OF = Date.UTC(2026, 10, 2, 12);

function uploadsAtPercent(percent: number): number {
  return (USAGE_GUARD.monthlyLimitBytes * percent) / 100 / USAGE_GUARD.bytesPerUpload;
}

function bucket(hourStart: number, overrides: Partial<UsageLedgerBucket> = {}): UsageLedgerBucket {
  return {
    hourStart,
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
    secondsByMode: {},
    ...overrides,
  };
}

function ledger({
  uploads = 0,
  buckets = [bucket(MONTH_START)],
  monthKey = "2026-11",
  limitBytes = USAGE_GUARD.monthlyLimitBytes,
  paused = false,
}: {
  uploads?: number;
  buckets?: UsageLedgerBucket[];
  monthKey?: string;
  limitBytes?: number | null;
  paused?: boolean;
} = {}): UsageLedger {
  return {
    buckets,
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
    // `bytes` is left at 0: the assessment derives bytes from the upload count.
    estimate: { monthKey, uploads, bytes: 0, limitBytes, paused },
  };
}

describe("assessUsage levels", () => {
  it.each([
    { at: "just under 70%", uploads: uploadsAtPercent(70) - 1, level: "ok" },
    { at: "70%", uploads: uploadsAtPercent(70), level: "warn" },
    { at: "just under 90%", uploads: uploadsAtPercent(90) - 1, level: "warn" },
    { at: "90%", uploads: uploadsAtPercent(90), level: "critical" },
  ] as const)("is $level at $at", ({ uploads, level }) => {
    expect(assessUsage(ledger({ uploads }), AS_OF, false)?.level).toBe(level);
  });

  it("estimates bytes as uploads times the guard's bytes per upload against the guard's limit", () => {
    const assessment = assessUsage(ledger({ uploads: 200_000 }), AS_OF, false);

    expect(assessment?.bytes).toBe(200_000 * USAGE_GUARD.bytesPerUpload);
    expect(assessment?.limitBytes).toBe(USAGE_GUARD.monthlyLimitBytes);
    expect(assessment?.percent).toBe(90);
  });

  it.each([
    { reported: "no limit", limitBytes: null },
    { reported: "twice the guard's limit", limitBytes: 2 * USAGE_GUARD.monthlyLimitBytes },
  ])("uses the guard's limit when the phone reports $reported", ({ limitBytes }) => {
    const assessment = assessUsage(ledger({ uploads: uploadsAtPercent(90), limitBytes }), AS_OF, false);

    expect(assessment?.limitBytes).toBe(USAGE_GUARD.monthlyLimitBytes);
    expect(assessment?.percent).toBe(90);
    expect(assessment?.level).toBe("critical");
  });

  it("is paused when the phone's estimate is paused, whatever the percent", () => {
    expect(assessUsage(ledger({ uploads: 0, paused: true }), AS_OF, false)?.level).toBe("paused");
  });

  it("is paused when the publishing phase is paused, whatever the percent", () => {
    expect(assessUsage(ledger({ uploads: 0 }), AS_OF, true)?.level).toBe("paused");
  });

  it.each(["2026-13", "2026-1", "November 2026", ""])("returns null for the month key %j", (monthKey) => {
    expect(assessUsage(ledger({ monthKey }), AS_OF, false)).toBeNull();
  });
});

describe("assessUsage pace", () => {
  it("is null until the minimum period has been counted", () => {
    const usage = ledger({ uploads: 1_000 });

    expect(assessUsage(usage, MONTH_START + MIN_PACE_ELAPSED_MS - HOUR_MS, false)?.pace).toBeNull();
    expect(assessUsage(usage, MONTH_START + MIN_PACE_ELAPSED_MS, false)?.pace).not.toBeNull();
  });

  it("is null for the first three counted days after a mid-month reset", () => {
    const resetAt = MONTH_START + 15 * DAY_MS;
    const assessment = assessUsage(
      ledger({ uploads: 50_000, buckets: [bucket(resetAt)] }),
      resetAt + MIN_PACE_ELAPSED_MS - HOUR_MS,
      false,
    );

    // Projected from under three counted days, 22.5% would reach about 228% and warn.
    expect(assessment?.pace).toBeNull();
    expect(assessment?.level).toBe("ok");
  });

  // 50,000 uploads (22.5%) counted from the month start.
  it.each([
    { name: "warns at a low percent when the month-end pace is over 100", asOf: MONTH_START + 6 * DAY_MS, pace: 112.5, level: "warn" },
    { name: "does not warn at a pace of exactly 100", asOf: MONTH_START + 6 * DAY_MS + 18 * HOUR_MS, pace: 100, level: "ok" },
    { name: "does not warn when the pace is under 100", asOf: MONTH_START + 10 * DAY_MS, pace: 67.5, level: "ok" },
    { name: "stops counting at month end while the phone still reports last month", asOf: Date.UTC(2026, 11, 5), pace: 22.5, level: "ok" },
  ] as const)("$name", ({ asOf, pace, level }) => {
    const assessment = assessUsage(ledger({ uploads: 50_000 }), asOf, false);

    expect(assessment?.pace).toBeCloseTo(pace);
    expect(assessment?.level).toBe(level);
  });

  it("projects from the counted period, not the whole month, when counting started late", () => {
    const countedFrom = MONTH_START + 15 * DAY_MS;
    const assessment = assessUsage(
      ledger({ uploads: 50_000, buckets: [bucket(countedFrom)] }),
      countedFrom + 3 * DAY_MS,
      false,
    );

    // 22.5% over 3 counted days projects to 225% over 30 days (not 37.5% over the 18 elapsed).
    expect(assessment?.countedFromMs).toBe(countedFrom);
    expect(assessment?.pace).toBeCloseTo(225);
    expect(assessment?.level).toBe("warn");
  });
});

describe("assessUsage counting start", () => {
  it("covers the whole month when counters start before it", () => {
    const assessment = assessUsage(
      ledger({ buckets: [bucket(MONTH_START + 5 * HOUR_MS), bucket(MONTH_START - 2 * DAY_MS)] }),
      AS_OF,
      false,
    );

    expect(assessment?.countedFromMs).toBe(MONTH_START);
    expect(assessment?.partial).toBe(false);
  });

  it("starts at the oldest bucket after a reset", () => {
    const resetAt = MONTH_START + 9 * HOUR_MS;
    const assessment = assessUsage(
      ledger({ buckets: [bucket(resetAt + 3 * HOUR_MS), bucket(resetAt)] }),
      AS_OF,
      false,
    );

    expect(assessment?.countedFromMs).toBe(resetAt);
    expect(assessment?.partial).toBe(true);
  });

  it("starts after the last hour that accepted points without counting an upload", () => {
    const lastUncounted = MONTH_START + 10 * HOUR_MS;
    const assessment = assessUsage(
      ledger({
        buckets: [
          bucket(MONTH_START - DAY_MS, { uploads: 0 }),
          bucket(lastUncounted, { uploads: 0 }),
          // No points accepted: an idle hour, not one recorded before uploads were counted.
          bucket(lastUncounted + 2 * HOUR_MS, { uploads: 0, samplesSent: 0, samplesAcked: 0 }),
          bucket(lastUncounted + 3 * HOUR_MS),
        ],
      }),
      AS_OF,
      false,
    );

    expect(assessment?.countedFromMs).toBe(lastUncounted + HOUR_MS);
    expect(assessment?.partial).toBe(true);
  });

  it("has no counted period without buckets", () => {
    const assessment = assessUsage(ledger({ buckets: [] }), AS_OF, false);

    expect(assessment?.countedFromMs).toBeNull();
    expect(assessment?.partial).toBe(true);
    expect(assessment?.pace).toBeNull();
  });
});

describe("isUsageEscalation", () => {
  it.each([
    { name: "toasts the first warning", last: null, month: "2026-11", level: "warn", expected: true },
    { name: "does not repeat the same level", last: "2026-11:warn", month: "2026-11", level: "warn", expected: false },
    { name: "toasts a higher level", last: "2026-11:warn", month: "2026-11", level: "critical", expected: true },
    { name: "toasts a pause after critical", last: "2026-11:critical", month: "2026-11", level: "paused", expected: true },
    { name: "does not toast a lower level", last: "2026-11:critical", month: "2026-11", level: "warn", expected: false },
    { name: "starts over in a new month", last: "2026-10:paused", month: "2026-11", level: "warn", expected: true },
    { name: "never toasts ok", last: null, month: "2026-11", level: "ok", expected: false },
  ] as const)("$name", ({ last, month, level, expected }) => {
    expect(isUsageEscalation(last, month, level)).toBe(expected);
  });

  it("reads the key written by usageToastKey", () => {
    expect(usageToastKey("2026-11", "critical")).toBe("2026-11:critical");
    expect(isUsageEscalation(usageToastKey("2026-11", "critical"), "2026-11", "critical")).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UsageLedger, UsageLedgerBucket } from "./usageWarning";

const STORAGE_KEY = "tripcast.usageBaselines.v1";
const NOW = Date.UTC(2026, 10, 18, 15, 30);

function bucket(hourStart: number, samplesAcked: number): UsageLedgerBucket {
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

function ledgerOf(buckets: UsageLedgerBucket[]): UsageLedger {
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
    estimate: { monthKey: "2026-11", uploads: 0, bytes: 0, limitBytes: null, paused: false },
  };
}

/** The store keeps its state at module level, so each test loads a fresh copy over the stored entry. */
async function loadStore() {
  vi.resetModules();
  return import("./usageBaselines");
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usage baselines store", () => {
  it("starts empty", async () => {
    const store = await loadStore();

    expect(store.getUsageBaselines()).toEqual({ baselines: {}, fileBytesAddedThisMonth: 0 });
  });

  it("saves a dashboard figure on the phone and re-enters it at any time", async () => {
    const store = await loadStore();

    store.saveUsageBaseline("database", 120_000_000);
    store.saveUsageBaseline("file", 300_000_000);
    expect(store.getUsageBaselines().baselines.database).toEqual({
      bytes: 120_000_000,
      enteredAtMs: NOW,
      foldedThroughHourMs: Date.UTC(2026, 10, 18, 15),
      foldedPoints: 0,
    });
    expect(store.getUsageBaselines().baselines.file).toEqual({ bytes: 300_000_000, enteredAtMs: NOW, addedBytes: 0 });

    store.saveUsageBaseline("file", 350_000_000);
    expect(store.getUsageBaselines().baselines.file?.bytes).toBe(350_000_000);

    const reloaded = await loadStore();
    expect(reloaded.getUsageBaselines().baselines.database?.bytes).toBe(120_000_000);
    expect(reloaded.getUsageBaselines().baselines.file?.bytes).toBe(350_000_000);
  });

  it("keeps the other figure when one is saved, in either order", async () => {
    const store = await loadStore();

    store.saveUsageBaseline("file", 300_000_000);
    store.saveUsageBaseline("database", 120_000_000);
    expect(store.getUsageBaselines().baselines.file?.bytes).toBe(300_000_000);
    expect(store.getUsageBaselines().baselines.database?.bytes).toBe(120_000_000);

    store.saveUsageBaseline("file", 310_000_000);
    expect(store.getUsageBaselines().baselines.database?.bytes).toBe(120_000_000);
  });

  it("clears both baselines when the trip data is deleted", async () => {
    const store = await loadStore();
    store.saveUsageBaseline("database", 1);
    store.saveUsageBaseline("file", 1);

    store.clearUsageBaselines();

    expect(store.getUsageBaselines().baselines).toEqual({});
    expect((await loadStore()).getUsageBaselines().baselines).toEqual({});
  });

  it("counts uploaded photo bytes for this month and, once there is a figure, since it", async () => {
    const store = await loadStore();

    store.recordUploadedFileBytes(40_000);
    expect(store.getUsageBaselines()).toEqual({ baselines: {}, fileBytesAddedThisMonth: 40_000 });

    store.saveUsageBaseline("file", 1_000);
    store.recordUploadedFileBytes(60_000);
    expect(store.getUsageBaselines().fileBytesAddedThisMonth).toBe(100_000);
    expect(store.getUsageBaselines().baselines.file?.addedBytes).toBe(60_000);
  });

  it("ignores a size that is not a positive number", async () => {
    const store = await loadStore();

    store.recordUploadedFileBytes(0);
    store.recordUploadedFileBytes(-5);
    store.recordUploadedFileBytes(Number.NaN);

    expect(store.getUsageBaselines().fileBytesAddedThisMonth).toBe(0);
  });

  it("starts the monthly photo count over in a new UTC month and keeps the baseline", async () => {
    const store = await loadStore();
    store.saveUsageBaseline("file", 1_000);
    store.recordUploadedFileBytes(50_000);

    vi.setSystemTime(Date.UTC(2026, 11, 1, 0, 5));

    expect(store.getUsageBaselines().fileBytesAddedThisMonth).toBe(0);
    expect(store.getUsageBaselines().baselines.file?.addedBytes).toBe(50_000);
  });

  it("returns the same snapshot until something changes", async () => {
    const store = await loadStore();

    const first = store.getUsageBaselines();
    expect(store.getUsageBaselines()).toBe(first);

    store.recordUploadedFileBytes(10);
    expect(store.getUsageBaselines()).not.toBe(first);
  });

  it("folds the ledger into the database baseline and keeps it across a reset", async () => {
    const store = await loadStore();
    store.saveUsageBaseline("database", 1_000);
    const ledger = ledgerOf([bucket(Date.UTC(2026, 10, 18, 15), 120), bucket(Date.UTC(2026, 10, 18, 14), 900)]);

    expect(store.foldUsageBaselines(ledger, NOW).baselines.database?.foldedPoints).toBe(0);
    expect(store.foldUsageBaselines(ledger, NOW, { closeOpenHour: true }).baselines.database).toMatchObject({
      foldedPoints: 120,
      foldedThroughHourMs: Date.UTC(2026, 10, 18, 16),
    });
    expect(store.foldUsageBaselines(ledgerOf([]), NOW + 3_600_000).baselines.database?.foldedPoints).toBe(120);

    expect((await loadStore()).getUsageBaselines().baselines.database?.foldedPoints).toBe(120);
  });

  it("leaves a fold alone when there is no database baseline", async () => {
    const store = await loadStore();
    const before = store.getUsageBaselines();

    expect(store.foldUsageBaselines(ledgerOf([bucket(NOW, 5)]), NOW)).toBe(before);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it.each([
    ["database", "bytes"],
    ["database", "enteredAtMs"],
    ["database", "foldedThroughHourMs"],
    ["database", "foldedPoints"],
    ["file", "bytes"],
    ["file", "enteredAtMs"],
    ["file", "addedBytes"],
  ] as const)("drops the %s baseline stored without a number for %s", async (kind, field) => {
    const valid = {
      database: { bytes: 1, enteredAtMs: 2, foldedThroughHourMs: 3, foldedPoints: 4 },
      file: { bytes: 1, enteredAtMs: 2, addedBytes: 4 },
    };
    const { [field as keyof (typeof valid)[typeof kind]]: _omitted, ...broken } = valid[kind] as Record<string, number>;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ baselines: { ...valid, [kind]: broken }, fileMonth: { month: "2026-11", bytes: 0 } }),
    );

    const store = await loadStore();

    expect(store.getUsageBaselines().baselines[kind]).toBeUndefined();
    const other = kind === "database" ? "file" : "database";
    expect(store.getUsageBaselines().baselines[other]).toEqual(valid[other]);
  });

  it("starts empty from a stored entry that cannot be read", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ baselines: { file: { bytes: "lots" } }, fileMonth: 3 }));

    const store = await loadStore();

    expect(store.getUsageBaselines()).toEqual({ baselines: {}, fileBytesAddedThisMonth: 0 });
  });
});

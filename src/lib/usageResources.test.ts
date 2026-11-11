import { describe, expect, it } from "vitest";
import { USAGE_GUARD, USAGE_LEVEL_COPY, USAGE_STORAGE_MODEL, assessUsage, usageToastKey, type UsageLedger, type UsageLedgerBucket } from "./usageWarning";
import {
  FUNCTION_CALLS_PER_UPLOAD,
  assessResources,
  foldPoints,
  newDatabaseBaseline,
  newFileBaseline,
  parseDashboardFigure,
  pendingResourceEscalation,
  pointsSinceBaseline,
  usageResourceCopy,
  worstResourceLevel,
  type ResourceAssessment,
  type ResourceInputs,
  type UsageResource,
} from "./usageResources";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const NOW = Date.UTC(2026, 10, 18, 15, 30);
const MB = 1_000_000;

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

function ledgerOf(buckets: UsageLedgerBucket[], uploads = 0, paused = false): UsageLedger {
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
    estimate: {
      monthKey: "2026-11",
      uploads,
      bytes: uploads * USAGE_GUARD.bytesPerUpload,
      limitBytes: USAGE_GUARD.monthlyLimitBytes,
      paused,
    },
  };
}

function inputs(overrides: Partial<ResourceInputs> = {}): ResourceInputs {
  return {
    ledger: ledgerOf([]),
    nowMs: NOW,
    uploadsPaused: false,
    photoEgressBytes: 0,
    storageModel: USAGE_STORAGE_MODEL,
    ...overrides,
  };
}

function rowOf(rows: ResourceAssessment[], resource: UsageResource): ResourceAssessment {
  const found = rows.find((row) => row.resource === resource);
  if (!found) throw new Error(`no ${resource} row`);
  return found;
}

describe("foldPoints", () => {
  // Entered at 14:20, so counting starts with the 14:00 hour.
  const baseline = newDatabaseBaseline(100 * MB, Date.UTC(2026, 10, 18, 14, 20));
  const buckets = [
    bucket(Date.UTC(2026, 10, 18, 13), 900),
    bucket(Date.UTC(2026, 10, 18, 14), 100),
    bucket(Date.UTC(2026, 10, 18, 15), 50),
  ];

  it("starts the watermark at the entry hour", () => {
    expect(baseline.foldedThroughHourMs).toBe(Date.UTC(2026, 10, 18, 14));
    expect(baseline.foldedPoints).toBe(0);
  });

  it("folds finished hours from the watermark, leaves the open hour and earlier hours out, and advances the watermark", () => {
    const folded = foldPoints(baseline, ledgerOf(buckets), NOW);

    expect(folded.foldedPoints).toBe(100);
    expect(folded.foldedThroughHourMs).toBe(Date.UTC(2026, 10, 18, 15));
  });

  it("never counts the open hour twice across folds and reads", () => {
    const ledger = ledgerOf(buckets);
    const once = foldPoints(baseline, ledger, NOW);
    expect(pointsSinceBaseline(once, ledger, NOW)).toBe(150);

    const again = foldPoints(once, ledger, NOW + 10 * 60_000);
    expect(again.foldedPoints).toBe(100);
    expect(pointsSinceBaseline(again, ledger, NOW + 10 * 60_000)).toBe(150);

    const grown = ledgerOf([...buckets.slice(0, 2), bucket(Date.UTC(2026, 10, 18, 15), 80)]);
    expect(pointsSinceBaseline(again, grown, NOW + 20 * 60_000)).toBe(180);

    const nextHour = NOW + HOUR_MS;
    const closed = foldPoints(again, grown, nextHour);
    expect(closed.foldedPoints).toBe(180);
    expect(closed.foldedThroughHourMs).toBe(Date.UTC(2026, 10, 18, 16));
    expect(pointsSinceBaseline(closed, grown, nextHour)).toBe(180);
  });

  it("keeps the folded points after a reset wipes the buckets", () => {
    const ledger = ledgerOf(buckets);
    const closed = foldPoints(baseline, ledger, NOW, { closeOpenHour: true });

    expect(closed.foldedPoints).toBe(150);
    expect(closed.foldedThroughHourMs).toBe(Date.UTC(2026, 10, 18, 16));

    const afterReset = ledgerOf([]);
    expect(pointsSinceBaseline(closed, afterReset, NOW)).toBe(150);
    expect(foldPoints(closed, afterReset, NOW + 2 * HOUR_MS).foldedPoints).toBe(150);

    const laterHour = ledgerOf([bucket(Date.UTC(2026, 10, 18, 16), 30)]);
    expect(pointsSinceBaseline(closed, laterHour, NOW + HOUR_MS)).toBe(180);
  });

  describe("when the clock was set ahead and has gone back", () => {
    const hour = (h: number) => Date.UTC(2026, 10, 18, h);
    const entered = newDatabaseBaseline(100 * MB, hour(10) + 20 * 60_000);
    const aheadHour = hour(10) + 30 * DAY_MS;

    // As the phone writes it: a bucket at the device clock's hour, even while that clock is wrong.
    it("keeps counting the points added after the clock goes back", () => {
      const aheadLedger = ledgerOf([bucket(hour(10), 100), bucket(hour(11), 50), bucket(aheadHour, 0)]);
      const folded = foldPoints(entered, aheadLedger, aheadHour + 5 * 60_000);
      expect(folded.foldedPoints).toBe(150);
      expect(folded.foldedThroughHourMs).toBe(aheadHour);

      const backLedger = ledgerOf([bucket(hour(10), 100), bucket(hour(11), 50), bucket(hour(12), 40), bucket(aheadHour, 0)]);
      const backAt = hour(12) + 30 * 60_000;
      const back = foldPoints(folded, backLedger, backAt);
      expect(back.foldedThroughHourMs).toBe(hour(12));
      expect(pointsSinceBaseline(back, backLedger, backAt)).toBe(190);

      expect(foldPoints(back, backLedger, hour(13) + 60_000).foldedPoints).toBe(190);
    });
  });

  it("does not move a watermark that is already past the hour it is asked to fold", () => {
    const closed = foldPoints(baseline, ledgerOf(buckets), NOW, { closeOpenHour: true });

    expect(foldPoints(closed, ledgerOf(buckets), NOW)).toBe(closed);
  });
});

describe("parseDashboardFigure", () => {
  it("reads MB and GB as decimal bytes", () => {
    expect(parseDashboardFigure("512", "MB")).toBe(512_000_000);
    expect(parseDashboardFigure("2", "GB")).toBe(2_000_000_000);
  });

  it("reads decimals and trims spaces", () => {
    expect(parseDashboardFigure("1.5", "GB")).toBe(1_500_000_000);
    expect(parseDashboardFigure(" 0.25 ", "MB")).toBe(250_000);
    expect(parseDashboardFigure(".5", "GB")).toBe(500_000_000);
    expect(parseDashboardFigure("0", "MB")).toBe(0);
  });

  it.each(["", "  ", "abc", "-1", "1e3", "1,5", "1.2.3", "12 MB", "5.", "Infinity", "NaN", "0x10"])(
    "rejects %j",
    (text) => {
      expect(parseDashboardFigure(text, "MB")).toBeNull();
    },
  );
});

describe("assessResources", () => {
  it("lists the five resources in screen order with their Free allowances", () => {
    const rows = assessResources(inputs());

    expect(rows.map((row) => row.resource)).toEqual([
      "functionCalls",
      "databaseIo",
      "databaseStorage",
      "fileStorage",
      "dataEgress",
    ]);
    expect(rows.map((row) => row.allowance.amount)).toEqual([1_000_000, 1_000_000_000, 500_000_000, 1_000_000_000, 1_000_000_000]);
  });

  it("estimates Function Calls as this month's uploads times 1.65", () => {
    const row = rowOf(assessResources(inputs({ ledger: ledgerOf([], 200_000) })), "functionCalls");

    expect(FUNCTION_CALLS_PER_UPLOAD).toBe(1.65);
    expect(row.amount).toBeCloseTo(330_000, 6);
    expect(row.percent).toBeCloseTo(33, 6);
    expect(row.level).toBe("ok");
  });

  it("warns at 70 percent and is critical from 90 percent, and at 100 percent too", () => {
    const levelAt = (uploads: number) =>
      rowOf(assessResources(inputs({ ledger: ledgerOf([], uploads) })), "functionCalls").level;

    expect(levelAt(Math.ceil(700_000 / 1.65))).toBe("warn");
    expect(levelAt(Math.ceil(900_000 / 1.65))).toBe("critical");
    expect(levelAt(Math.ceil(1_200_000 / 1.65))).toBe("critical");
  });

  it("puts the levels exactly at 70 and 90 percent", () => {
    const levelOf = (bytes: number) => rowOf(assessResources(inputs({ photoEgressBytes: bytes })), "dataEgress").level;

    expect(levelOf(699_999_999)).toBe("ok");
    expect(levelOf(700 * MB)).toBe("warn");
    expect(levelOf(899_999_999)).toBe("warn");
    expect(levelOf(900 * MB)).toBe("critical");
  });

  it("gives Function Calls no amount and no level when the phone's month is unreadable", () => {
    const ledger = ledgerOf([], 200_000);
    const unreadable: UsageLedger = { ...ledger, estimate: { ...ledger.estimate, monthKey: "not-a-month" } };
    const rows = assessResources(inputs({ ledger: unreadable }));

    for (const resource of ["functionCalls", "databaseIo"] as const) {
      expect(rowOf(rows, resource)).toMatchObject({ amount: null, percent: null, level: null, unavailable: "unreadable-month" });
    }
  });

  it("keeps the Database I/O assessment exactly as assessUsage has it", () => {
    const ledger = ledgerOf([bucket(NOW - 5 * DAY_MS, 10)], 160_000);
    const expected = assessUsage(ledger, NOW, false);
    const row = rowOf(assessResources(inputs({ ledger })), "databaseIo");

    expect(expected).not.toBeNull();
    expect(row.amount).toBe(expected!.bytes);
    expect(row.percent).toBe(expected!.percent);
    expect(row.level).toBe(expected!.level);

    const paused = rowOf(assessResources(inputs({ ledger, uploadsPaused: true })), "databaseIo");
    expect(paused.level).toBe("paused");
  });

  it("never gives another resource month-end pace or the paused level", () => {
    const rows = assessResources(inputs({
      ledger: ledgerOf([bucket(NOW - 10 * DAY_MS, 10)], 100, true),
      uploadsPaused: true,
      photoEgressBytes: 2_000_000_000,
    }));

    expect(rows.filter((row) => row.level === "paused").map((row) => row.resource)).toEqual(["databaseIo"]);
    expect(rowOf(rows, "dataEgress").level).toBe("critical");
  });

  it("measures Data Egress from the photo bytes this device loaded", () => {
    const row = rowOf(assessResources(inputs({ photoEgressBytes: 750 * MB })), "dataEgress");

    expect(row.amount).toBe(750 * MB);
    expect(row.level).toBe("warn");
  });

  describe("storage rows", () => {
    it("gives Database Storage no level without a dashboard figure and shows this month's growth", () => {
      const ledger = ledgerOf([bucket(Date.UTC(2026, 10, 5), 4_000_000)]);
      const row = rowOf(assessResources(inputs({ ledger })), "databaseStorage");

      // 4,000,000 points × 242 B × 1.7 is 1.65 GB: far past the allowance, and still no level.
      expect(row.amount).toBeCloseTo(4_000_000 * 242 * 1.7, 3);
      expect(row.level).toBeNull();
      expect(row.baseline).toBeNull();
    });

    it("counts only this month's points when there is no dashboard figure", () => {
      const ledger = ledgerOf([bucket(Date.UTC(2026, 9, 31, 23), 1000), bucket(Date.UTC(2026, 10, 1), 10)]);
      const row = rowOf(assessResources(inputs({ ledger })), "databaseStorage");

      expect(row.addedBytes).toBeCloseTo(10 * 242 * 1.7, 6);
    });

    it("adds the points since the dashboard figure to it and levels the total", () => {
      const baseline = { ...newDatabaseBaseline(400 * MB, Date.UTC(2026, 10, 10, 9)), foldedPoints: 100_000 };
      const ledger = ledgerOf([bucket(Date.UTC(2026, 10, 18, 15), 50_000)]);
      const row = rowOf(assessResources(inputs({ ledger, baselines: { database: baseline } })), "databaseStorage");

      expect(row.addedBytes).toBeCloseTo(150_000 * 242 * 1.7, 6);
      expect(row.amount).toBeCloseTo(400 * MB + 150_000 * 242 * 1.7, 6);
      expect(row.level).toBe("critical");
      expect(row.baseline).toEqual({ bytes: 400 * MB, enteredAtMs: baseline.enteredAtMs });
    });

    it("gives File Storage no level without a dashboard figure and the photo bytes added this month", () => {
      const row = rowOf(assessResources(inputs({ fileBytesAddedThisMonth: 950 * MB })), "fileStorage");

      expect(row.amount).toBe(950 * MB);
      expect(row.level).toBeNull();
    });

    it("adds the photo bytes since the dashboard figure to it and levels the total", () => {
      const baseline = { ...newFileBaseline(600 * MB, NOW), addedBytes: 150 * MB };
      const row = rowOf(
        assessResources(inputs({ baselines: { file: baseline }, fileBytesAddedThisMonth: 999 * MB })),
        "fileStorage",
      );

      expect(row.amount).toBe(750 * MB);
      expect(row.level).toBe("warn");
    });

    it("says why a row has no estimate", () => {
      const loading = assessResources(inputs({ ledger: undefined }));
      const none = assessResources(inputs({ ledger: null, storageModel: null }));

      expect(rowOf(loading, "functionCalls").unavailable).toBe("loading");
      expect(rowOf(none, "functionCalls").unavailable).toBe("no-counters");
      expect(rowOf(none, "databaseIo").unavailable).toBe("no-counters");
      expect(rowOf(none, "databaseStorage").unavailable).toBe("no-counters");
      expect(rowOf(assessResources(inputs({ storageModel: null })), "databaseStorage").unavailable).toBe("no-model");
      expect(rowOf(none, "fileStorage").unavailable).toBeNull();
      expect(rowOf(none, "dataEgress").unavailable).toBeNull();
    });
  });
});

describe("worstResourceLevel", () => {
  it("picks the most severe level and the resource it belongs to", () => {
    const rows = assessResources(inputs({ ledger: ledgerOf([], 160_000), photoEgressBytes: 950 * MB }));

    expect(rowOf(rows, "databaseIo").level).toBe("warn");
    expect(worstResourceLevel(rows)).toEqual({ resource: "dataEgress", level: "critical" });
  });

  it("breaks a tie in favor of Database I/O", () => {
    const rows = assessResources(inputs({ ledger: ledgerOf([], 160_000), photoEgressBytes: 750 * MB }));

    expect(worstResourceLevel(rows)).toEqual({ resource: "databaseIo", level: "warn" });
  });

  it("is null when no row has a level", () => {
    expect(worstResourceLevel(assessResources(inputs({ ledger: null })).filter((row) => row.level === null))).toBeNull();
  });
});

describe("pendingResourceEscalation", () => {
  const noneToasted = () => null;

  it("picks the most severe pending escalation, one per read", () => {
    const rows = assessResources(inputs({
      ledger: ledgerOf([], 160_000),
      photoEgressBytes: 950 * MB,
      baselines: { file: newFileBaseline(750 * MB, NOW) },
    }));

    // Database I/O warn, File Storage warn, Data Egress critical.
    expect(pendingResourceEscalation(rows, "2026-11", noneToasted)).toEqual({ resource: "dataEgress", level: "critical" });
  });

  it("leaves the others pending for a later read", () => {
    const rows = assessResources(inputs({
      ledger: ledgerOf([], 160_000),
      photoEgressBytes: 950 * MB,
      baselines: { file: newFileBaseline(750 * MB, NOW) },
    }));
    const toasted: Partial<Record<UsageResource, string>> = {};
    const reads = [];
    for (let read = 0; read < 4; read += 1) {
      const next = pendingResourceEscalation(rows, "2026-11", (resource) => toasted[resource] ?? null);
      if (next) toasted[next.resource] = usageToastKey("2026-11", next.level);
      reads.push(next);
    }

    expect(reads).toEqual([
      { resource: "dataEgress", level: "critical" },
      { resource: "databaseIo", level: "warn" },
      { resource: "fileStorage", level: "warn" },
      null,
    ]);
  });

  it("toasts a resource once per escalation per month", () => {
    const warnRows = assessResources(inputs({ photoEgressBytes: 750 * MB }));
    const criticalRows = assessResources(inputs({ photoEgressBytes: 950 * MB }));
    const lastKey = (key: string | null) => (resource: UsageResource) => (resource === "dataEgress" ? key : null);

    expect(pendingResourceEscalation(warnRows, "2026-11", lastKey(null))).toEqual({ resource: "dataEgress", level: "warn" });
    expect(pendingResourceEscalation(warnRows, "2026-11", lastKey("2026-11:warn"))).toBeNull();
    expect(pendingResourceEscalation(criticalRows, "2026-11", lastKey("2026-11:warn"))).toEqual({
      resource: "dataEgress",
      level: "critical",
    });
    expect(pendingResourceEscalation(criticalRows, "2026-11", lastKey("2026-11:critical"))).toBeNull();
    expect(pendingResourceEscalation(warnRows, "2026-12", lastKey("2026-11:critical"))).toEqual({
      resource: "dataEgress",
      level: "warn",
    });
  });

  it("ignores a resource with no level or at ok", () => {
    const rows = assessResources(inputs({ fileBytesAddedThisMonth: 950 * MB }));

    expect(pendingResourceEscalation(rows, "2026-11", noneToasted)).toBeNull();
  });
});

describe("usageResourceCopy", () => {
  it("keeps the Database I/O copy, for it and for no resource", () => {
    expect(usageResourceCopy("databaseIo", "critical")).toBe(USAGE_LEVEL_COPY.critical);
    expect(usageResourceCopy(undefined, "paused")).toBe(USAGE_LEVEL_COPY.paused);
  });

  it("names another resource and leaves out the upload pause", () => {
    expect(usageResourceCopy("functionCalls", "warn")).toEqual({
      label: "Warning",
      message: "Estimated Function Calls is past 70% of the Free plan.",
    });
    expect(usageResourceCopy("fileStorage", "critical")).toEqual({
      label: "Critical",
      message: "Estimated File Storage is past 90% of the Free plan.",
    });
    expect(usageResourceCopy("dataEgress", "ok").message).toBe("Estimated Data Egress is within the Free plan.");
    expect(usageResourceCopy("databaseStorage", "paused").message).not.toMatch(/pause/i);
  });
});

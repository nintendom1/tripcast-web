import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ConvexUsageScreen, type ConvexUsageScreenProps } from "./ConvexUsageScreen";
import { newDatabaseBaseline, newFileBaseline, type UsageBaselines } from "../../lib/usageResources";
import {
  USAGE_GUARD,
  USAGE_STORAGE_MODEL,
  type UsageLedger,
  type UsageLedgerBucket,
} from "../../lib/usageWarning";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const NOW = Date.UTC(2026, 10, 18, 15, 0);
const MONTH_START = Date.UTC(2026, 10, 1);
const PAUSE_AT_UPLOADS =
  (USAGE_GUARD.monthlyLimitBytes * USAGE_GUARD.pausePercent) / 100 / USAGE_GUARD.bytesPerUpload;

/**
 * Tracking from 08:00 UTC for `hoursPerDay` hours a day over the 20 days before `nowMs`. The
 * estimate is this UTC month's successful uploads times the guard's bytes per upload, as on the
 * phone; once it reaches the pause point the phone stops uploading but keeps tracking.
 */
function makeLedger({
  uploadsPerHour,
  hoursPerDay = 10,
  nowMs = NOW,
  emissionIntervalSeconds = 15,
}: {
  uploadsPerHour: number;
  hoursPerDay?: number;
  nowMs?: number;
  emissionIntervalSeconds?: 0 | 15 | 30 | null;
}): UsageLedger {
  const buckets: UsageLedgerBucket[] = [];
  let monthUploads = 0;
  for (let hourStart = nowMs - 20 * DAY_MS; hourStart < nowMs; hourStart += HOUR_MS) {
    const hour = new Date(hourStart).getUTCHours();
    if (hour < 8 || hour >= 8 + hoursPerDay) continue;
    const inMonth = hourStart >= MONTH_START;
    const paused = inMonth && monthUploads >= PAUSE_AT_UPLOADS;
    const uploads = paused ? 0 : uploadsPerHour;
    if (inMonth) monthUploads += uploads;
    const lostSignal = hour === 12 && !paused;
    const requests = uploads + (lostSignal ? 6 : 0);
    buckets.push({
      hourStart,
      requests,
      uploads,
      samplesSent: paused ? 0 : 1180,
      samplesAcked: paused ? 0 : 1176,
      bytesSent: (paused ? 0 : 1180 * 530) + requests * 200,
      bytesReceived: requests * 180,
      retries: lostSignal ? 6 : 0,
      failures: { network: lostSignal ? 6 : 0, server: 0, rateLimited: 0, auth: 0, paused: 0, rejected: 0 },
      samplesSetAside: 0,
      samplesThinned: 0,
      secondsByMode: { precise: 2700, "power-saving": 900 },
    });
  }
  return {
    buckets,
    policy: {
      emissionIntervalSeconds,
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
      uploads: monthUploads,
      bytes: monthUploads * USAGE_GUARD.bytesPerUpload,
      limitBytes: USAGE_GUARD.monthlyLimitBytes,
      paused: monthUploads >= PAUSE_AT_UPLOADS,
    },
  };
}

const LEDGER = makeLedger({ uploadsPerHour: 240 });

// Counters reset on Nov 12 at 09:00 UTC, which also cleared the estimate; no upload interval chosen.
const RESET_FROM = Date.UTC(2026, 10, 12, 9);
const RESET_BUCKETS = LEDGER.buckets.filter((bucket) => bucket.hourStart >= RESET_FROM);
const RESET_UPLOADS = RESET_BUCKETS.reduce((sum, bucket) => sum + bucket.uploads, 0);
const RESET_LEDGER: UsageLedger = {
  buckets: RESET_BUCKETS,
  policy: { ...LEDGER.policy, emissionIntervalSeconds: null },
  estimate: {
    ...LEDGER.estimate,
    uploads: RESET_UPLOADS,
    bytes: RESET_UPLOADS * USAGE_GUARD.bytesPerUpload,
  },
};

// Updated to this build on Nov 9: earlier buckets accepted points but counted no uploads.
const UPDATED_AT = Date.UTC(2026, 10, 10);
const FIRST_MONTH_BUCKETS = LEDGER.buckets.map((bucket) =>
  bucket.hourStart < UPDATED_AT ? { ...bucket, uploads: 0 } : bucket,
);
const FIRST_MONTH_UPLOADS = FIRST_MONTH_BUCKETS
  .filter((bucket) => bucket.hourStart >= MONTH_START)
  .reduce((sum, bucket) => sum + bucket.uploads, 0);
const FIRST_MONTH_LEDGER: UsageLedger = {
  ...LEDGER,
  buckets: FIRST_MONTH_BUCKETS,
  estimate: {
    ...LEDGER.estimate,
    uploads: FIRST_MONTH_UPLOADS,
    bytes: FIRST_MONTH_UPLOADS * USAGE_GUARD.bytesPerUpload,
  },
};

const MB = 1_000_000;
// The Traveler read the two storage figures off the Convex dashboard on Nov 10, at noon.
const ENTERED_AT = Date.UTC(2026, 10, 10, 12);
const BASELINES: UsageBaselines = {
  database: newDatabaseBaseline(180 * MB, ENTERED_AT),
  file: { ...newFileBaseline(420 * MB, ENTERED_AT), addedBytes: 38 * MB },
};
const NEAR_LIMIT_BASELINES: UsageBaselines = {
  database: newDatabaseBaseline(390 * MB, ENTERED_AT),
  file: { ...newFileBaseline(700 * MB, ENTERED_AT), addedBytes: 250 * MB },
};

const meta = {
  title: "Options/ConvexUsageScreen",
  component: ConvexUsageScreen,
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-[var(--bg-paper)] p-4 text-[var(--ink-1)]">
        <div className="mx-auto max-w-xl">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: {
    viewport: {
      viewports: {
        mobile: { name: "Mobile (390x844)", styles: { width: "390px", height: "844px" } },
      },
      defaultViewport: "mobile",
    },
  },
  args: {
    role: "traveler",
    ledger: LEDGER,
    storageModel: USAGE_STORAGE_MODEL,
    photoEgressBytes: 18.4 * 1024 * 1024,
    nowMs: NOW,
    uploadsPaused: false,
    onResetCounters: fn(),
    fileBytesAddedThisMonth: 6.2 * MB,
    onSaveBaseline: fn(),
  },
} satisfies Meta<typeof ConvexUsageScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ok: Story = {};

// Upload interval at Immediate: under 70% so far, but on pace to pass the allowance.
export const Warn: Story = {
  args: { ledger: makeLedger({ uploadsPerHour: 800, emissionIntervalSeconds: 0 }) },
};

export const Critical: Story = {
  args: { ledger: makeLedger({ uploadsPerHour: 1150, emissionIntervalSeconds: 0 }) },
};

// Twelve hours a day at Immediate: the estimate reached 99% and the phone stopped uploading.
export const Paused: Story = {
  args: { ledger: makeLedger({ uploadsPerHour: 1100, hoursPerDay: 12, emissionIntervalSeconds: 0 }) },
};

// The phone has not been given its limit yet (before the first configure after launch): the app
// still estimates from the upload count with its own guard.
export const LimitNotSentYet: Story = {
  args: { ledger: { ...LEDGER, estimate: { ...LEDGER.estimate, bytes: 0, limitBytes: null, paused: false } } },
};

// Just after a reset: no hours counted yet.
export const JustReset: Story = {
  args: { ledger: { ...LEDGER, buckets: [], estimate: { ...LEDGER.estimate, uploads: 0, bytes: 0, paused: false } } },
};

export const FirstMonthOnThisBuild: Story = {
  args: { ledger: FIRST_MONTH_LEDGER },
};

export const NoCounters: Story = {
  args: { ledger: null },
};

export const CountersSinceReset: Story = {
  args: { ledger: RESET_LEDGER },
};

export const CountersLoading: Story = {
  render: (args) => <ConvexUsageScreen {...args} ledger={undefined} />,
};

// Two days into the month: pace is not projected yet.
export const EarlyInMonth: Story = {
  args: {
    nowMs: Date.UTC(2026, 10, 3, 9, 0),
    ledger: makeLedger({ uploadsPerHour: 240, nowMs: Date.UTC(2026, 10, 3, 9, 0) }),
  },
};

export const Follower: Story = {
  args: { role: "follower" },
};

// All five resources, with both dashboard figures entered; File Storage is past 70%.
export const FiveResources: Story = {
  args: {
    ledger: makeLedger({ uploadsPerHour: 240 }),
    baselines: { ...BASELINES, file: { ...BASELINES.file!, addedBytes: 320 * MB } },
    photoEgressBytes: 310 * MB,
  },
};

// Both figures entered: each storage row shows the total, what the phone added since, and when it was entered.
export const WithBaselines: Story = {
  args: { baselines: BASELINES },
};

// No dashboard figure: each storage row shows only what this phone added this month, and has no level.
export const NoBaselines: Story = {
  args: { baselines: undefined, fileBytesAddedThisMonth: 950 * MB },
};

// Other resources past 90%, with Database I/O at warn: they get their own level and copy, never the upload pause.
export const CriticalResources: Story = {
  args: {
    ledger: makeLedger({ uploadsPerHour: 800, emissionIntervalSeconds: 0 }),
    baselines: NEAR_LIMIT_BASELINES,
    photoEgressBytes: 930 * MB,
  },
};

// Not iOS, or the counters could not be read: File Storage and Data Egress still show; the rest say why not.
export const NoCountersWithFigures: Story = {
  args: { ledger: null, baselines: { file: BASELINES.file }, photoEgressBytes: 120 * MB },
};

export const InvalidFigure: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Database Storage figure from the Convex dashboard"), "12 MB");
    const row = canvasElement.querySelector<HTMLElement>('[data-usage-resource="databaseStorage"]')!;
    await userEvent.click(within(row).getByRole("button", { name: "Save" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent("Enter a number");
  },
};

function EnterFigureDemo(args: ConvexUsageScreenProps) {
  const [baselines, setBaselines] = useState<UsageBaselines>({});
  return (
    <ConvexUsageScreen
      {...args}
      baselines={baselines}
      onSaveBaseline={(kind, bytes) =>
        setBaselines((current) =>
          kind === "database"
            ? { ...current, database: newDatabaseBaseline(bytes, NOW) }
            : { ...current, file: newFileBaseline(bytes, NOW) },
        )
      }
    />
  );
}

// Entering a figure gives the row a total, a level and the entered date.
export const EnterFigure: Story = {
  render: (args) => <EnterFigureDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("File Storage figure from the Convex dashboard"), "0.95");
    await userEvent.selectOptions(canvas.getByLabelText("File Storage unit"), "GB");
    const row = canvasElement.querySelector<HTMLElement>('[data-usage-resource="fileStorage"]')!;
    await userEvent.click(within(row).getByRole("button", { name: "Save" }));
    await expect(within(row).getByText("Critical")).toBeInTheDocument();
    await expect(row.querySelector("[data-usage-baseline]")).toHaveTextContent("from dashboard");
  },
};

import { useState } from "react";
import { Database, ExternalLink, ImageIcon, Smartphone, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import type { NativeTrackingMode } from "../../native/nativeTrackingState";
import { useNativePublishingTagsSent } from "../../native/nativePublishingSignal";
import {
  MIN_PACE_ELAPSED_MS,
  USAGE_LEVEL_COPY,
  assessUsage,
  monthBoundsUtc,
  type UsageLedger,
  type UsageLedgerBucket,
  type UsageLevel,
  type UsagePolicy,
  type UsageStorageModel,
} from "../../lib/usageWarning";
import {
  FUNCTION_CALLS_PER_UPLOAD,
  assessResources,
  parseDashboardFigure,
  usageResourceCopy,
  type DashboardUnit,
  type ResourceAssessment,
  type UsageAllowance,
  type UsageBaselineKind,
  type UsageBaselines,
} from "../../lib/usageResources";

export type ConvexUsageScreenProps = {
  role: "traveler" | "follower";
  /** `undefined` while loading; `null` when this device has no counters or estimate. Ignored for Followers. */
  ledger: UsageLedger | null | undefined;
  /** `null` until bytes per point have been measured. Ignored for Followers. */
  storageModel: UsageStorageModel | null;
  photoEgressBytes: number;
  /** When `ledger` was read. */
  nowMs: number;
  /** The phone's publishing phase is "paused". */
  uploadsPaused: boolean;
  onResetCounters: () => void;
  /** The dashboard figures the Traveler entered for the two storage resources. */
  baselines?: UsageBaselines;
  /** Bytes of photos this phone uploaded this month, for a File Storage row with no dashboard figure. */
  fileBytesAddedThisMonth?: number;
  /** Saves a dashboard figure, in bytes. The entry form shows only when this is passed. */
  onSaveBaseline?: (kind: UsageBaselineKind, bytes: number) => void;
};

type TrackedMode = Exclude<NativeTrackingMode, "off">;

const CONVEX_DASHBOARD_URL = "https://dashboard.convex.dev";
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const PACE_MIN_DAYS = MIN_PACE_ELAPSED_MS / DAY_MS;

const MODE_LABELS: Record<TrackedMode, string> = {
  precise: "Precise",
  "power-saving": "Power saving",
  legacy: "Legacy",
};

const POLICY_KEYS: Array<keyof UsagePolicy> = [
  "emissionIntervalSeconds",
  "maxBatchSize",
  "maxQueueDepth",
  "minEmissionIntervalSeconds",
  "heartbeatIntervalSeconds",
  "minDistanceMeters",
  "minBearingDistanceMeters",
  "turnThresholdDegrees",
];

const LEVEL_TONE: Record<UsageLevel, string> = {
  ok: "text-[var(--green-2)]",
  warn: "text-[var(--amber-2)]",
  critical: "text-[var(--danger)]",
  paused: "text-[var(--danger)]",
};

const METER_FILL: Record<UsageLevel, string> = {
  ok: "bg-[var(--ink-1)]",
  warn: "bg-[var(--amber-2)]",
  critical: "bg-[var(--danger)]",
  paused: "bg-[var(--danger)]",
};

type CounterRow = {
  label: string;
  read: (bucket: UsageLedgerBucket) => number;
  format: (value: number) => string;
};

const COUNTER_GROUPS: Array<{ title: string; rows: CounterRow[] }> = [
  {
    title: "Uploads",
    rows: [
      { label: "Successful uploads", read: (b) => b.uploads, format: formatCount },
      { label: "Requests", read: (b) => b.requests, format: formatCount },
      { label: "Points sent", read: (b) => b.samplesSent, format: formatCount },
      { label: "Points accepted", read: (b) => b.samplesAcked, format: formatCount },
      { label: "Retries", read: (b) => b.retries, format: formatCount },
      { label: "Points set aside", read: (b) => b.samplesSetAside, format: formatCount },
      { label: "Points thinned", read: (b) => b.samplesThinned, format: formatCount },
    ],
  },
  {
    title: "Failures",
    rows: [
      { label: "No network", read: (b) => b.failures.network, format: formatCount },
      { label: "Server", read: (b) => b.failures.server, format: formatCount },
      { label: "Rate limited", read: (b) => b.failures.rateLimited, format: formatCount },
      { label: "Sign-in expired", read: (b) => b.failures.auth, format: formatCount },
      { label: "Rejected", read: (b) => b.failures.rejected, format: formatCount },
    ],
  },
  {
    title: "Data",
    rows: [
      { label: "Sent", read: (b) => b.bytesSent, format: formatBytes },
      { label: "Received", read: (b) => b.bytesReceived, format: formatBytes },
    ],
  },
];

function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const hours = seconds / 3600;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} h`;
}

function formatAmount(value: number, unit: string | null | undefined): string {
  const text = new Intl.NumberFormat(undefined, value >= 1
    ? { maximumFractionDigits: value >= 100 ? 0 : 2 }
    : { maximumSignificantDigits: 3 }).format(value);
  return unit ? `${text} ${unit}` : text;
}

/** Decimal units, matching the Free plan's 1 GB (10^9 bytes). */
function formatDecimalBytes(bytes: number): string {
  if (bytes >= 1e9) return formatAmount(bytes / 1e9, "GB");
  if (bytes >= 1e6) return formatAmount(bytes / 1e6, "MB");
  return formatAmount(bytes / 1e3, "KB");
}

/** Rounds down so a percentage never displays past a threshold it has not reached. */
function formatPercent(percent: number): string {
  if (percent > 0 && percent < 0.1) return "<0.1%";
  return `${percent >= 10 ? Math.floor(percent) : (Math.floor(percent * 10) / 10).toFixed(1)}%`;
}

function formatAllowance(allowance: UsageAllowance): string {
  const amount = allowance.unit === "bytes" ? formatDecimalBytes(allowance.amount) : formatAmount(allowance.amount, "calls");
  return allowance.period === "month" ? `${amount} a month` : `${amount} total`;
}

function formatEnteredDate(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(ms);
}

function formatUtcHour(ms: number): string {
  const text = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(ms);
  return `${text} UTC`;
}

function startOfUtcMonth(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

/** Start of the oldest hour the phone has counters for, or `null` if it has none. */
function countersStart(ledger: UsageLedger | null | undefined): number | null {
  if (ledger == null || ledger.buckets.length === 0) return null;
  return Math.min(...ledger.buckets.map((bucket) => bucket.hourStart));
}

/** Buckets overlapping `[startMs, nowMs]`, including the one that straddles `startMs`. */
function bucketsSince(ledger: UsageLedger, startMs: number, nowMs: number): UsageLedgerBucket[] {
  return ledger.buckets.filter((bucket) => bucket.hourStart + HOUR_MS > startMs && bucket.hourStart <= nowMs);
}

function UsageSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h3 className="font-[var(--font-mono)] text-[11px] font-semibold uppercase text-[var(--ink-3)]">
        {label}
      </h3>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function UsageGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] shadow-sm divide-y divide-[var(--line-soft)]">
      {children}
    </div>
  );
}

function UsageIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--meter-track)] text-[var(--ink-2)]">
      <Icon className="h-5 w-5" aria-hidden />
    </div>
  );
}

function UsageNote({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-3 text-sm text-[var(--ink-3)] sm:px-5">{children}</p>;
}

function UsageMeter({ percent, level }: { percent: number; level: UsageLevel | null }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--meter-track)]" aria-hidden>
      <div
        className={cn("h-full rounded-full", METER_FILL[level ?? "ok"])}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

export function ConvexUsageScreen({
  role,
  ledger,
  storageModel,
  photoEgressBytes,
  nowMs,
  uploadsPaused,
  onResetCounters,
  baselines,
  fileBytesAddedThisMonth = 0,
  onSaveBaseline,
}: ConvexUsageScreenProps) {
  return (
    <div className="grid gap-6" data-convex-usage-screen={role}>
      {role === "traveler" ? (
        <DatabaseIoEstimateSection ledger={ledger} nowMs={nowMs} uploadsPaused={uploadsPaused} />
      ) : null}
      {role === "traveler" ? (
        <OtherResourcesSection
          rows={assessResources({
            ledger,
            nowMs,
            uploadsPaused,
            baselines,
            fileBytesAddedThisMonth,
            photoEgressBytes,
            storageModel,
          }).filter((row) => row.resource !== "databaseIo")}
          storageModel={storageModel}
          onSaveBaseline={onSaveBaseline}
        />
      ) : null}
      {role === "traveler" ? (
        <ObservedSection ledger={ledger} nowMs={nowMs} onResetCounters={onResetCounters} />
      ) : (
        <EstimatedSection photoEgressBytes={photoEgressBytes} />
      )}
    </div>
  );
}

function DatabaseIoEstimateSection({
  ledger,
  nowMs,
  uploadsPaused,
}: {
  ledger: UsageLedger | null | undefined;
  nowMs: number;
  uploadsPaused: boolean;
}) {
  return (
    <UsageSection label="Estimated Database I/O (this phone)">
      <UsageGroup>
        {ledger === undefined ? (
          <UsageNote>Loading the estimate from this phone.</UsageNote>
        ) : ledger === null ? (
          <UsageNote>No estimate on this device. The TripCast iOS app estimates usage from the GPS uploads it makes.</UsageNote>
        ) : (
          <EstimateDetail ledger={ledger} nowMs={nowMs} uploadsPaused={uploadsPaused} />
        )}
        <a
          href={CONVEX_DASHBOARD_URL}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-12 items-center justify-between gap-4 px-4 py-3 text-sm font-medium text-[var(--ink-1)] transition-colors hover:bg-[var(--meter-track)]/40 sm:px-5"
        >
          Real figures in the Convex dashboard
          <ExternalLink className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden />
        </a>
      </UsageGroup>
      <p className="text-xs leading-relaxed text-[var(--ink-3)]">
        This counts only this phone&apos;s GPS uploads, about 85% of a tracking month&apos;s Database I/O in
        simulation. It leaves out viewers, app opens and replay, so real usage is higher.
      </p>
    </UsageSection>
  );
}

function EstimateDetail({
  ledger,
  nowMs,
  uploadsPaused,
}: {
  ledger: UsageLedger;
  nowMs: number;
  uploadsPaused: boolean;
}) {
  // Same bytes per upload as the guard the phone was given: tagged while trip tags are sent.
  const tripTagsSent = useNativePublishingTagsSent();
  const assessment = assessUsage(ledger, nowMs, uploadsPaused, tripTagsSent);
  if (!assessment) return <UsageNote>No estimate: the phone reported an unreadable month.</UsageNote>;
  const bounds = monthBoundsUtc(assessment.monthKey);
  const monthLabel = bounds
    ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(bounds.startMs)
    : assessment.monthKey;
  const { level, pace } = assessment;

  return (
    <>
      <div className="flex items-start gap-4 px-4 py-3 sm:px-5">
        <UsageIcon icon={Database} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-[var(--ink-1)]">{monthLabel} (UTC)</p>
          <p className={cn("text-sm font-semibold", LEVEL_TONE[level])}>{USAGE_LEVEL_COPY[level].label}</p>
          <p className="text-sm text-[var(--ink-3)]">{USAGE_LEVEL_COPY[level].message}</p>
          {assessment.partial ? (
            <p className="mt-1 text-xs font-semibold text-[var(--amber-2)]" data-usage-partial="">
              {assessment.countedFromMs === null
                ? "No hours counted yet since the counters were reset."
                : `Counted since ${formatUtcHour(assessment.countedFromMs)} only; earlier uploads this month are not included.`}
            </p>
          ) : null}
        </div>
      </div>
      <div className="px-4 py-3 sm:px-5" data-usage-estimate="">
        <div className="flex items-baseline justify-between gap-4">
          <p className="min-w-0 text-base font-medium text-[var(--ink-1)]">Database I/O (estimated)</p>
          <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--ink-1)]">
            {formatPercent(assessment.percent)}
          </p>
        </div>
        <UsageMeter percent={assessment.percent} level={level} />
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          <dt className="text-[var(--ink-3)]">{assessment.partial ? "Uploads counted" : "Uploads this month"}</dt>
          <dd className="text-right tabular-nums text-[var(--ink-1)]">{formatAmount(assessment.uploads, null)}</dd>
          <dt className="text-[var(--ink-3)]">Estimated I/O</dt>
          <dd className="text-right tabular-nums text-[var(--ink-1)]">{formatDecimalBytes(assessment.bytes)}</dd>
          <dt className="text-[var(--ink-3)]">Free allowance</dt>
          <dd className="text-right tabular-nums text-[var(--ink-1)]">{formatDecimalBytes(assessment.limitBytes)}</dd>
          <dt className="text-[var(--ink-3)]">At current rate</dt>
          <dd className={cn("text-right tabular-nums text-[var(--ink-1)]", pace !== null && pace > 100 && "font-semibold text-[var(--amber-2)]")}>
            {pace !== null ? (
              `${formatPercent(pace)} by month end`
            ) : (
              <span className="text-[var(--ink-3)]">After {PACE_MIN_DAYS} days counted</span>
            )}
          </dd>
        </dl>
      </div>
    </>
  );
}

function ObservedSection({
  ledger,
  nowMs,
  onResetCounters,
}: {
  ledger: UsageLedger | null | undefined;
  nowMs: number;
  onResetCounters: () => void;
}) {
  if (ledger === undefined) {
    return (
      <UsageSection label="Observed (this phone)">
        <UsageGroup>
          <UsageNote>Loading counters from this phone.</UsageNote>
        </UsageGroup>
      </UsageSection>
    );
  }

  if (ledger === null) {
    return (
      <UsageSection label="Observed (this phone)">
        <UsageGroup>
          <div className="flex items-start gap-4 px-4 py-3 sm:px-5">
            <UsageIcon icon={Smartphone} />
            <p className="min-w-0 flex-1 text-sm text-[var(--ink-3)]">
              No counters from this device. The TripCast iOS app records them while it uploads GPS points.
            </p>
          </div>
        </UsageGroup>
      </UsageSection>
    );
  }

  const start = countersStart(ledger);
  const windows = [
    { label: "24 h", startMs: nowMs - DAY_MS },
    { label: "7 days", startMs: nowMs - 7 * DAY_MS },
    { label: "Month", startMs: startOfUtcMonth(nowMs) },
  ].map((window) => ({
    ...window,
    buckets: bucketsSince(ledger, window.startMs, nowMs),
    partial: start !== null && start > window.startMs,
  }));
  const modes = (Object.keys(MODE_LABELS) as TrackedMode[]).filter((mode) =>
    ledger.buckets.some((bucket) => bucket.secondsByMode[mode] != null),
  );
  const groups = [
    ...COUNTER_GROUPS,
    {
      title: "Time per mode",
      rows: modes.map((mode): CounterRow => ({
        label: MODE_LABELS[mode],
        read: (bucket) => bucket.secondsByMode[mode] ?? 0,
        format: formatDuration,
      })),
    },
  ].filter((group) => group.rows.length > 0);

  return (
    <UsageSection label="Observed (this phone)">
      <UsageGroup>
        {start === null ? (
          <UsageNote>No hours recorded yet.</UsageNote>
        ) : (
          <div className="px-4 py-3 sm:px-5">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col />
                <col className="w-14" />
                <col className="w-14" />
                <col className="w-14" />
              </colgroup>
              <thead>
                <tr className="text-xs text-[var(--ink-3)]">
                  <th scope="col" className="text-left font-normal">
                    <span className="sr-only">Counter</span>
                  </th>
                  {windows.map((window) => (
                    <th key={window.label} scope="col" className="text-right font-semibold">
                      {window.label}
                      {window.partial ? "*" : null}
                    </th>
                  ))}
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.title}>
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={4}
                      className="pb-1 pt-3 text-left font-[var(--font-mono)] text-[11px] font-semibold uppercase text-[var(--ink-3)]"
                    >
                      {group.title}
                    </th>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row" className="py-0.5 pr-2 text-left font-normal text-[var(--ink-2)]">
                        {row.label}
                      </th>
                      {windows.map((window) => (
                        <td key={window.label} className="whitespace-nowrap py-0.5 text-right tabular-nums text-[var(--ink-1)]">
                          {row.format(window.buckets.reduce((sum, bucket) => sum + row.read(bucket), 0))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
            <p className="mt-3 text-xs leading-relaxed text-[var(--ink-3)]">
              {windows.some((window) => window.partial)
                ? `* Only since ${formatUtcHour(start)}; this phone has no counters before then. `
                : null}
              Month runs from the 1st, UTC.
            </p>
          </div>
        )}
        <div className="px-4 py-3 sm:px-5">
          <p className="text-sm font-medium text-[var(--ink-1)]">Settings in effect</p>
          <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 font-[var(--font-mono)] text-xs">
            {POLICY_KEYS.map((key) => {
              const value = ledger.policy[key];
              return (
                <div key={key} className="contents">
                  <dt className="text-[var(--ink-3)] [overflow-wrap:anywhere]">{key}</dt>
                  <dd className="text-right text-[var(--ink-1)]">{value == null ? "Not set" : String(value)}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </UsageGroup>
      <Button variant="outline" className="w-full" onClick={onResetCounters}>
        Reset counters
      </Button>
    </UsageSection>
  );
}

const RESOURCE_NOTES: Partial<Record<ResourceAssessment["resource"], string>> = {
  functionCalls: `This phone's successful uploads × ${FUNCTION_CALLS_PER_UPLOAD} calls each.`,
  fileStorage: "Photos this phone uploaded.",
  dataEgress: "Story images loaded on this device. Map tiles no longer use Convex.",
};

const STORAGE_KIND: Partial<Record<ResourceAssessment["resource"], UsageBaselineKind>> = {
  databaseStorage: "database",
  fileStorage: "file",
};

const UNAVAILABLE_COPY: Record<NonNullable<ResourceAssessment["unavailable"]>, string> = {
  loading: "Not estimated yet: loading counters.",
  "no-counters": "Not estimated: no counters from this device.",
  "unreadable-month": "Not estimated: the phone reported an unreadable month.",
  "no-model": "Not estimated: bytes per point not measured yet.",
};

function OtherResourcesSection({
  rows,
  storageModel,
  onSaveBaseline,
}: {
  rows: ResourceAssessment[];
  storageModel: UsageStorageModel | null;
  onSaveBaseline?: (kind: UsageBaselineKind, bytes: number) => void;
}) {
  return (
    <UsageSection label="Other resources (estimated)">
      <UsageGroup>
        {rows.map((row) => (
          <ResourceRow key={row.resource} row={row} storageModel={storageModel} onSaveBaseline={onSaveBaseline} />
        ))}
      </UsageGroup>
      <p className="text-xs leading-relaxed text-[var(--ink-3)]">Action Compute and Search are not used by TripCast.</p>
    </UsageSection>
  );
}

function ResourceRow({
  row,
  storageModel,
  onSaveBaseline,
}: {
  row: ResourceAssessment;
  storageModel: UsageStorageModel | null;
  onSaveBaseline?: (kind: UsageBaselineKind, bytes: number) => void;
}) {
  const { resource, label, allowance, amount, percent, level, unavailable, baseline, addedBytes } = row;
  const kind = STORAGE_KIND[resource];
  const formatAmountOf = (value: number) =>
    allowance.unit === "bytes" ? formatDecimalBytes(value) : formatAmount(value, "calls");
  const copy = level === null || level === "ok" ? null : usageResourceCopy(resource, level);
  const note = resource === "databaseStorage" && storageModel
    ? `Points accepted × ${formatBytes(storageModel.bytesPerPoint)} per point × ${formatAmount(storageModel.indexCopies, null)} index copies.`
    : RESOURCE_NOTES[resource];

  return (
    <div className="px-4 py-3 sm:px-5" data-usage-resource={resource}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="min-w-0 text-base font-medium text-[var(--ink-1)]">{label}</p>
        {level !== null && percent !== null ? (
          <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--ink-1)]">{formatPercent(percent)}</p>
        ) : null}
      </div>
      {copy && level ? (
        <>
          <p className={cn("text-sm font-semibold", LEVEL_TONE[level])}>{copy.label}</p>
          <p className="text-sm text-[var(--ink-3)]">{copy.message}</p>
        </>
      ) : null}
      <UsageMeter percent={percent ?? 0} level={level} />
      {unavailable ? <p className="mt-2 text-sm text-[var(--ink-3)]">{UNAVAILABLE_COPY[unavailable]}</p> : null}
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        {amount !== null ? (
          <>
            <dt className="text-[var(--ink-3)]">{kind && !baseline ? "Added this month" : "Estimated"}</dt>
            <dd className="text-right tabular-nums text-[var(--ink-1)]">{formatAmountOf(amount)}</dd>
          </>
        ) : null}
        {kind && baseline && addedBytes != null ? (
          <>
            <dt className="text-[var(--ink-3)]">Added by this phone since</dt>
            <dd className="text-right tabular-nums text-[var(--ink-1)]">{formatAmountOf(addedBytes)}</dd>
          </>
        ) : null}
        <dt className="text-[var(--ink-3)]">Free allowance</dt>
        <dd className="text-right tabular-nums text-[var(--ink-1)]">{formatAllowance(allowance)}</dd>
      </dl>
      {note && amount !== null ? <p className="mt-2 text-xs text-[var(--ink-3)]">{note}</p> : null}
      {kind && baseline ? (
        <p className="mt-2 text-xs text-[var(--ink-3)]" data-usage-baseline="">
          Entered {formatEnteredDate(baseline.enteredAtMs)} from dashboard
        </p>
      ) : null}
      {kind && !baseline && onSaveBaseline ? (
        <p className="mt-2 text-xs text-[var(--ink-3)]">
          Enter the figure from the Convex dashboard to compare the total with the Free allowance.
        </p>
      ) : null}
      {kind && onSaveBaseline ? (
        <BaselineForm label={label} onSave={(bytes) => onSaveBaseline(kind, bytes)} />
      ) : null}
    </div>
  );
}

function BaselineForm({ label, onSave }: { label: string; onSave: (bytes: number) => void }) {
  const [text, setText] = useState("");
  const [unit, setUnit] = useState<DashboardUnit>("MB");
  const [invalid, setInvalid] = useState(false);

  return (
    <form
      className="mt-3 grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const bytes = parseDashboardFigure(text, unit);
        setInvalid(bytes === null);
        if (bytes === null) return;
        onSave(bytes);
        setText("");
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          inputMode="decimal"
          autoComplete="off"
          placeholder="Figure"
          aria-label={`${label} figure from the Convex dashboard`}
          aria-invalid={invalid}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-w-0 flex-1"
        />
        <select
          aria-label={`${label} unit`}
          value={unit}
          onChange={(event) => setUnit(event.target.value as DashboardUnit)}
          className="h-9 rounded-md border border-input bg-card px-2 text-sm text-card-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="MB">MB</option>
          <option value="GB">GB</option>
        </select>
        <Button type="submit" variant="outline" disabled={text.trim() === ""}>
          Save
        </Button>
      </div>
      {invalid ? (
        <p className="text-xs text-[var(--ink-danger)]" role="alert">
          Enter a number such as 120 or 1.5.
        </p>
      ) : null}
    </form>
  );
}

function EstimatedSection({ photoEgressBytes }: { photoEgressBytes: number }) {
  return (
    <UsageSection label="Estimated">
      <UsageGroup>
        <div className="flex flex-col gap-2 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-4">
            <UsageIcon icon={ImageIcon} />
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium text-[var(--ink-1)]">Photo downloads this month</p>
              <p className="text-sm text-[var(--ink-3)]">
                ≈ {(photoEgressBytes / (1024 * 1024)).toFixed(1)} MB image data loaded on this device
              </p>
            </div>
          </div>
          <div className="rounded-lg bg-[var(--meter-track)]/60 px-3 py-2 text-xs text-[var(--ink-3)]">
            Per-device estimate (story images only). Map tiles no longer use Convex. Authoritative total is in
            the Convex dashboard.
          </div>
        </div>
      </UsageGroup>
    </UsageSection>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type {
  AddTransactionArgs,
  Transaction,
  TransactionCategory,
  TransactionVisibility,
} from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { useDebugLogger } from "../../debug/useDebugLogger";
import {
  CATEGORY_OPTIONS,
  COMMON_CURRENCIES,
  VISIBILITY_OPTIONS,
  formatUsd,
  isValidCurrencyCode,
} from "./currency";
import { type CurrencyRates, loadCurrencyPrefs, saveCurrencyPrefs } from "./currencyPrefs";

const labelClass = "text-xs font-medium text-[var(--ink-2)]";
const mutedTextClass = "text-[var(--ink-3)]";
const selectClass = "w-full rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--ink-1)] outline-none focus:border-[var(--flag)] focus:ring-1 focus:ring-[var(--flag)]";
const previewClass = "rounded-md border border-[var(--line-soft)] bg-[var(--meter-track)] px-2.5 py-1.5 text-xs text-[var(--ink-1)]";
const errorClass = "text-xs text-[var(--ink-danger)]";
const dangerGhostClass = "text-[var(--ink-danger)] hover:bg-[var(--bg-danger)] hover:text-[var(--ink-danger)]";

export type TransactionFormValues = {
  title: string;
  note?: string;
  category: TransactionCategory;
  currencyCode: string;
  localAmount: number;
  localCurrencyPerUsd: number;
  countsTowardMeter: boolean;
  visibility: TransactionVisibility;
  linkedActivityId?: string;
  linkedMissionId?: string;
  linkedCheckpointId?: string;
  occurredAt?: number;
};

type TransactionFormProps = {
  token: string;
  mode: "add" | "edit";
  initial?: Transaction;
  onSubmit: (values: TransactionFormValues) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  /** Pre-creation linking target. When `mode === "add"`, the submitted values
   *  carry this through to the backend so the new transaction is linked
   *  atomically. Ignored in edit mode (edit uses the row's existing link). */
  prefillMissionId?: string;
  prefillCheckpointId?: string;
  /** Called when the user clicks "Unlink" in edit mode. Parent fires the
   *  updateTransaction mutation clearing the link field. */
  onUnlink?: () => Promise<void>;
  submitLabel?: string;
};

function defaultCategory(): TransactionCategory {
  return CATEGORY_OPTIONS[0].value;
}

function formatDateTimeInput(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDateTimeInput(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export default function TransactionForm({
  token,
  mode,
  initial,
  onSubmit,
  onCancel,
  onDelete,
  prefillMissionId,
  prefillCheckpointId,
  onUnlink,
  submitLabel,
}: TransactionFormProps) {
  const log = useDebugLogger("TransactionForm", "src/features/travelfunds/TransactionForm.tsx");
  const activity = useQuery(tripcastApi.currentActivity.travelerGetCurrentActivity, { token });

  const [title, setTitle] = useState(initial?.title ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [category, setCategory] = useState<TransactionCategory>(initial?.category ?? defaultCategory());

  const [currencyPrefs] = useState(() => loadCurrencyPrefs());

  const lastUsedCurrency = useMemo(() => {
    if (mode === "add" && !initial) {
      return currencyPrefs.lastCurrency;
    }
    return initial?.currencyCode ?? "USD";
  }, [mode, initial, currencyPrefs]);

  const isInitialCustom = !COMMON_CURRENCIES.some((c) => c.code === lastUsedCurrency);

  const [currencySelect, setCurrencySelect] = useState<string>(
    isInitialCustom ? "OTHER" : lastUsedCurrency,
  );
  const [customCurrency, setCustomCurrency] = useState<string>(
    isInitialCustom ? lastUsedCurrency : "",
  );
  const [localAmount, setLocalAmount] = useState<string>(
    initial?.localAmount !== undefined ? String(initial.localAmount) : "",
  );

  const [rates, setRates] = useState<CurrencyRates>(() => {
    if (initial) {
      return { [initial.currencyCode]: initial.localCurrencyPerUsd };
    }
    return currencyPrefs.rates;
  });

  const effectiveCurrencyCode =
    currencySelect === "OTHER" ? customCurrency.trim().toUpperCase() : currencySelect;

  const [rate, setRate] = useState<string>(() => {
    if (initial?.localCurrencyPerUsd !== undefined) return String(initial.localCurrencyPerUsd);
    if (mode === "add") {
      return String(rates[lastUsedCurrency] ?? "1");
    }
    return "1";
  });
  const [countsTowardMeter, setCountsTowardMeter] = useState<boolean>(
    initial?.countsTowardMeter ?? true,
  );
  const [visibility, setVisibility] = useState<TransactionVisibility>(
    initial?.visibility ?? "public",
  );
  const [occurredAtInput, setOccurredAtInput] = useState<string>(() =>
    formatDateTimeInput(initial?.occurredAt ?? Date.now()),
  );
  const [linkToActivity, setLinkToActivity] = useState<boolean>(
    mode === "add"
      ? Boolean(activity) // default true if activity exists
      : Boolean(initial?.linkedActivityId),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasExistingLink = Boolean(
    initial &&
      (initial.linkedMissionId || initial.linkedCheckpointId || initial.linkedActivityId),
  );

  // When the activity query loads, default the link checkbox for add mode
  useEffect(() => {
    if (mode === "add" && activity && !initial) {
      setLinkToActivity(true);
    }
  }, [mode, activity, initial]);

  const effectiveRate = effectiveCurrencyCode === "USD" ? 1 : Number(rate);
  const parsedLocal = Number(localAmount);
  const usdPreview = useMemo(() => {
    if (!Number.isFinite(parsedLocal) || !Number.isFinite(effectiveRate) || effectiveRate <= 0)
      return null;
    return Math.round((parsedLocal / effectiveRate) * 100) / 100;
  }, [parsedLocal, effectiveRate]);

  const publicForcesCounted = visibility === "public" && !countsTowardMeter;
  const isNegative = Number.isFinite(parsedLocal) && parsedLocal < 0;

  function handleVisibilityChange(next: TransactionVisibility) {
    setVisibility(next);
    if (next === "public" && !countsTowardMeter) {
      setCountsTowardMeter(true);
    }
  }

  function handleCountsChange(next: boolean) {
    if (!next && visibility === "public") {
      setError("Public transactions must count toward the meter. Switch to summary or private first.");
      return;
    }
    setError(null);
    setCountsTowardMeter(next);
  }

  function handleRateChange(val: string) {
    setRate(val);
    const num = Number(val);
    if (Number.isFinite(num) && num > 0) {
      setRates((prev) => ({ ...prev, [effectiveCurrencyCode]: num }));
    }
  }

  function handleCurrencySelectChange(val: string) {
    setCurrencySelect(val);
    if (val === "USD") {
      setRate("1");
    } else if (val !== "OTHER") {
      setRate(String(rates[val] ?? "1"));
    } else {
      const code = customCurrency.trim().toUpperCase();
      if (isValidCurrencyCode(code)) {
        setRate(String(rates[code] ?? "1"));
      } else {
        setRate("1");
      }
    }
  }

  function handleCustomCurrencyChange(val: string) {
    const code = val.toUpperCase();
    setCustomCurrency(code);
    if (isValidCurrencyCode(code)) {
      setRate(String(rates[code] ?? "1"));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Block the synthetic submit from bubbling to any ancestor <form> in the
    // React tree — the picker may be rendered inside AddCheckpointSheet's
    // form, and React events bubble through portals.
    e.stopPropagation();
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!isValidCurrencyCode(effectiveCurrencyCode)) {
      setError("Currency must be a 3-letter code.");
      return;
    }
    if (!Number.isFinite(parsedLocal)) {
      setError("Amount must be a number.");
      return;
    }
    if (effectiveCurrencyCode !== "USD") {
      if (!Number.isFinite(effectiveRate) || effectiveRate <= 0) {
        setError("Exchange rate must be a positive number.");
        return;
      }
    }
    if (publicForcesCounted) {
      setError("Public transactions must count toward the meter.");
      return;
    }
    const occurredAt = parseDateTimeInput(occurredAtInput);
    if (occurredAt === null) {
      setError("Happened at must be a valid date and time.");
      return;
    }
    if (occurredAt > Date.now()) {
      setError("Happened at cannot be in the future.");
      return;
    }
    setIsSubmitting(true);
    try {
      const values: TransactionFormValues = {
        title: title.trim(),
        note: note.trim() ? note.trim() : undefined,
        category,
        currencyCode: effectiveCurrencyCode,
        localAmount: parsedLocal,
        localCurrencyPerUsd: effectiveCurrencyCode === "USD" ? 1 : effectiveRate,
        countsTowardMeter,
        visibility,
        linkedActivityId: linkToActivity && activity ? activity._id : undefined,
        ...(mode === "add" && prefillMissionId ? { linkedMissionId: prefillMissionId } : {}),
        ...(mode === "add" && prefillCheckpointId
          ? { linkedCheckpointId: prefillCheckpointId }
          : {}),
        occurredAt,
      };
      log.logFunds("transaction:submit", {
        mode,
        prefillMissionId: prefillMissionId ?? null,
        prefillCheckpointId: prefillCheckpointId ?? null,
        linkedActivityId: values.linkedActivityId ?? null,
        linkedMissionId: values.linkedMissionId ?? null,
        linkedCheckpointId: values.linkedCheckpointId ?? null,
        currencyCode: values.currencyCode,
        localAmount: values.localAmount,
        usdAmount: usdPreview,
        category: values.category,
        visibility: values.visibility,
        countsTowardMeter: values.countsTowardMeter,
      });
      try {
        await onSubmit(values);
        log.logFunds("transaction:submit:success", { mode });
        if (mode === "add") {
          saveCurrencyPrefs({
            lastCurrency: values.currencyCode,
            rates: { ...rates, [values.currencyCode]: values.localCurrencyPerUsd },
          });
        }
      } catch (submitError) {
        log.error("transaction:submit:error", "funds", {
          mode,
          message:
            submitError instanceof Error ? submitError.message : String(submitError),
          linkedActivityId: values.linkedActivityId ?? null,
          linkedMissionId: values.linkedMissionId ?? null,
          linkedCheckpointId: values.linkedCheckpointId ?? null,
        });
        throw submitError;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    if (!confirm("Delete this transaction? This cannot be undone.")) return;
    setIsDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleUnlink() {
    if (!onUnlink) return;
    setIsUnlinking(true);
    setError(null);
    try {
      await onUnlink();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUnlinking(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="tx-title">Title</label>
        <Input
          id="tx-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="e.g. Onsen ticket"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="tx-amount">Amount</label>
          <Input
            id="tx-amount"
            value={localAmount}
            onChange={(e) => setLocalAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
          {isNegative && (
            <span className="text-[10px] text-[var(--teal)]">Refund / credit</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="tx-currency">Currency</label>
          <select
            id="tx-currency"
            value={currencySelect}
            onChange={(e) => handleCurrencySelectChange(e.target.value)}
            className={selectClass}
          >
            {COMMON_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
            <option value="OTHER">Other…</option>
          </select>
        </div>
      </div>

      {currencySelect === "OTHER" && (
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="tx-custom-currency">Currency code</label>
          <Input
            id="tx-custom-currency"
            value={customCurrency}
            onChange={(e) => handleCustomCurrencyChange(e.target.value)}
            maxLength={3}
            placeholder="e.g. THB"
            className="font-mono"
          />
        </div>
      )}

      {effectiveCurrencyCode !== "USD" && (
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="tx-rate">
            Exchange rate <span className={`${mutedTextClass} font-normal`}>— local currency per 1 USD</span>
          </label>
          <Input
            id="tx-rate"
            value={rate}
            onChange={(e) => handleRateChange(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 150"
          />
          <p className={`text-[10px] ${mutedTextClass}`}>
            This rate is saved with the transaction and will not change automatically later.
          </p>
        </div>
      )}

      <div className={previewClass}>
        <span className={mutedTextClass}>USD: </span>
        <span className="font-semibold">
          {usdPreview === null ? "—" : formatUsd(usdPreview)}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="tx-category">Category</label>
        <select
          id="tx-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as TransactionCategory)}
          className={selectClass}
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.emoji} {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="tx-occurred-at">Happened at</label>
        <Input
          id="tx-occurred-at"
          type="datetime-local"
          value={occurredAtInput}
          onChange={(e) => setOccurredAtInput(e.target.value)}
          max={formatDateTimeInput(Date.now())}
          step={60}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="tx-note">Note (optional)</label>
        <Textarea
          id="tx-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder=""
        />
      </div>

      <fieldset className="flex flex-col gap-1.5 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-2.5 py-2">
        <legend className={labelClass}>Visibility</legend>
        {VISIBILITY_OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="tx-visibility"
              value={opt.value}
              checked={visibility === opt.value}
              onChange={() => handleVisibilityChange(opt.value)}
              className="mt-0.5"
            />
            <span className="flex flex-col">
              <span className="text-sm text-[var(--ink-1)]">{opt.label}</span>
              <span className={`text-[11px] ${mutedTextClass}`}>{opt.desc}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={countsTowardMeter}
          onChange={(e) => handleCountsChange(e.target.checked)}
          disabled={visibility === "public"}
          className="mt-0.5"
        />
        <span className="flex flex-col">
          <span className="text-sm text-[var(--ink-1)]">Counts toward Travel Funds</span>
          <span className={`text-[11px] ${mutedTextClass}`}>
            Public transactions always count. Uncheck for informational entries (only available for summary/private).
          </span>
        </span>
      </label>

      {activity && (
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={linkToActivity}
            onChange={(e) => setLinkToActivity(e.target.checked)}
            className="mt-0.5"
          />
          <span className="flex flex-col">
            <span className="text-sm text-[var(--ink-1)]">Link to current activity</span>
            <span className={`text-[11px] ${mutedTextClass} truncate`}>
              {activity.emoji ?? "⚡"} {activity.title}
            </span>
          </span>
        </label>
      )}

      {mode === "edit" && hasExistingLink && onUnlink && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--meter-track)] px-2.5 py-1.5 text-xs text-[var(--ink-2)]">
          <span>This transaction is linked to a story, mission, or activity.</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleUnlink}
            disabled={isUnlinking || isSubmitting || isDeleting}
          >
            {isUnlinking ? "Unlinking…" : "Unlink"}
          </Button>
        </div>
      )}

      {error && (
        <p className={errorClass} role="alert">{error}</p>
      )}

      <div className="flex justify-between gap-2 pt-1">
        {mode === "edit" && onDelete ? (
          <Button
            type="button"
            variant="ghost"
            className={dangerGhostClass}
            onClick={handleDelete}
            disabled={isDeleting || isSubmitting || isUnlinking}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting || isDeleting || isUnlinking}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || isDeleting || isUnlinking}>
            {isSubmitting ? "Saving…" : submitLabel ?? (mode === "add" ? "Add" : "Save")}
          </Button>
        </div>
      </div>
    </form>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ChevronDown, Wallet } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import type {
  TransactionCategory,
  TransactionInlineInput,
  TransactionVisibility,
} from "../../convex/tripcastApi";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  CATEGORY_OPTIONS,
  COMMON_CURRENCIES,
  VISIBILITY_OPTIONS,
  formatUsd,
  isValidCurrencyCode,
} from "./currency";

type Prefill = {
  localAmount?: number;
  currencyCode?: string;
  localCurrencyPerUsd?: number;
  category?: TransactionCategory;
};

type TravelFundsInlineSectionProps = {
  token: string;
  prefill?: Prefill;
  /**
   * Called whenever the section's serialized value changes.
   *   - `null` when the section is collapsed, empty, or invalid (parent should
   *     not send a `transaction` arg in this case).
   *   - `TransactionInlineInput` when the section is expanded and the user has
   *     entered a valid amount.
   * The parent inspects this on submit and decides whether to include it.
   */
  onChange: (value: TransactionInlineInput | null) => void;
};

/**
 * Collapsable "Travel Funds" section embedded in completion flows (check-in
 * form and challenge-completion form). Mirrors the existing "Also Update
 * Traveler State" pattern: a header that toggles open, then a compact set of
 * transaction fields. The section is intentionally optional — collapsed means
 * "no transaction".
 */
export default function TravelFundsInlineSection({
  token,
  prefill,
  onChange,
}: TravelFundsInlineSectionProps) {
  const config = useQuery(tripcastApi.travelFunds.travelerGetConfig, { token });
  const [open, setOpen] = useState(false);

  const initialCurrency = prefill?.currencyCode ?? "USD";
  const isInitialCustom =
    initialCurrency && !COMMON_CURRENCIES.some((c) => c.code === initialCurrency);
  const [currencySelect, setCurrencySelect] = useState<string>(
    isInitialCustom ? "OTHER" : initialCurrency,
  );
  const [customCurrency, setCustomCurrency] = useState<string>(
    isInitialCustom ? initialCurrency : "",
  );
  const [localAmount, setLocalAmount] = useState<string>(
    prefill?.localAmount !== undefined ? String(prefill.localAmount) : "",
  );
  const [rate, setRate] = useState<string>(
    prefill?.localCurrencyPerUsd !== undefined ? String(prefill.localCurrencyPerUsd) : "1",
  );
  const [category, setCategory] = useState<TransactionCategory>(prefill?.category ?? "other");
  const [title, setTitle] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [visibility, setVisibility] = useState<TransactionVisibility>("public");
  const [countsTowardMeter, setCountsTowardMeter] = useState<boolean>(true);

  const effectiveCurrencyCode =
    currencySelect === "OTHER" ? customCurrency.trim().toUpperCase() : currencySelect;
  const effectiveRate = effectiveCurrencyCode === "USD" ? 1 : Number(rate);
  const parsedLocal = Number(localAmount);
  const usdPreview = useMemo(() => {
    if (!Number.isFinite(parsedLocal) || !Number.isFinite(effectiveRate) || effectiveRate <= 0)
      return null;
    return Math.round((parsedLocal / effectiveRate) * 100) / 100;
  }, [parsedLocal, effectiveRate]);

  // Push the serialized value upward when the section is open and valid.
  useEffect(() => {
    if (!open) {
      onChange(null);
      return;
    }
    if (
      !title.trim() ||
      !Number.isFinite(parsedLocal) ||
      !isValidCurrencyCode(effectiveCurrencyCode) ||
      !Number.isFinite(effectiveRate) ||
      effectiveRate <= 0 ||
      (visibility === "public" && !countsTowardMeter)
    ) {
      onChange(null);
      return;
    }
    onChange({
      title: title.trim(),
      note: note.trim() ? note.trim() : undefined,
      category,
      currencyCode: effectiveCurrencyCode,
      localAmount: parsedLocal,
      localCurrencyPerUsd: effectiveCurrencyCode === "USD" ? 1 : effectiveRate,
      countsTowardMeter,
      visibility,
    });
  }, [
    open,
    title,
    note,
    category,
    effectiveCurrencyCode,
    parsedLocal,
    effectiveRate,
    visibility,
    countsTowardMeter,
    onChange,
  ]);

  function handleVisibilityChange(next: TransactionVisibility) {
    setVisibility(next);
    if (next === "public" && !countsTowardMeter) setCountsTowardMeter(true);
  }

  // Hide entirely if Travel Funds is disabled — the inline section is meaningless then.
  if (config && !config.enabled) return null;
  if (config === undefined) return null;

  return (
    <section className="rounded-md border border-slate-200">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-slate-50"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
      >
        <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="flex-1">Travel Funds <span className="text-muted-foreground font-normal">— optional</span></span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t px-3 py-3 flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" htmlFor="tfis-title">Title</label>
            <Input
              id="tfis-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="e.g. Lunch at the ramen shop"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" htmlFor="tfis-amount">Amount</label>
              <Input
                id="tfis-amount"
                value={localAmount}
                onChange={(e) => setLocalAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" htmlFor="tfis-currency">Currency</label>
              <select
                id="tfis-currency"
                value={currencySelect}
                onChange={(e) => setCurrencySelect(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
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
              <label className="text-xs font-medium" htmlFor="tfis-custom">Currency code</label>
              <Input
                id="tfis-custom"
                value={customCurrency}
                onChange={(e) => setCustomCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="e.g. THB"
                className="font-mono"
              />
            </div>
          )}

          {effectiveCurrencyCode !== "USD" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" htmlFor="tfis-rate">
                Exchange rate <span className="text-muted-foreground font-normal">— local per 1 USD</span>
              </label>
              <Input
                id="tfis-rate"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 150"
              />
            </div>
          )}

          <div className="rounded-md bg-slate-50 px-2.5 py-1 text-xs">
            <span className="text-muted-foreground">USD: </span>
            <span className="font-semibold">
              {usdPreview === null ? "—" : formatUsd(usdPreview)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" htmlFor="tfis-category">Category</label>
              <select
                id="tfis-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as TransactionCategory)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.emoji} {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" htmlFor="tfis-visibility">Visibility</label>
              <select
                id="tfis-visibility"
                value={visibility}
                onChange={(e) => handleVisibilityChange(e.target.value as TransactionVisibility)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
              >
                {VISIBILITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={countsTowardMeter}
              onChange={(e) => {
                if (!e.target.checked && visibility === "public") return;
                setCountsTowardMeter(e.target.checked);
              }}
              disabled={visibility === "public"}
              className="mt-0.5"
            />
            <span className="text-[11px] text-muted-foreground">
              Count toward Travel Funds
            </span>
          </label>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" htmlFor="tfis-note">Note (optional)</label>
            <Textarea
              id="tfis-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
            />
          </div>
        </div>
      )}
    </section>
  );
}

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ChevronLeft, DollarSign, Plus, Settings as SettingsIcon } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { Transaction } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ConfirmDelete } from "../../components/ui/ConfirmDelete";
import { cn } from "@/lib/utils";
import { formatUsd } from "./currency";
import TransactionForm, { type TransactionFormValues } from "./TransactionForm";
import TransactionRows from "./TransactionRows";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import { TERMS } from "../../copy/terminology";
import { useSheetPersonalities } from "../redesign/sheetPersonality";

type TravelFundsSheetProps = {
  token: string;
  onClose: () => void;
  debugSource?: { source: string; sourceLabel: string };
};

type View = "summary" | "add" | "edit" | "settings";
type BudgetMode = "trip" | "daily";
type CarryoverMode = "none" | "overspend_only";

const VIEW_TITLES: Record<View, string> = {
  summary: TERMS.travelFunds,
  add: "Add spending",
  edit: "Edit transaction",
  settings: `${TERMS.funds} settings`,
};

const MAX_STARTING_BUDGET_USD = 10_000_000;

function getLocalDayStart(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatDateInput(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const timestamp = new Date(year, month - 1, day).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function friendlyTravelFundsError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("startingBudgetUsd must be between 0 and 10000000")) {
    return "Starting budget must be between $0 and $10,000,000.";
  }
  if (message.includes("fundsStartAt must be a non-negative timestamp")) {
    return "Start date is required for daily funds.";
  }
  return message || "Unable to save Travel Funds settings.";
}

export default function TravelFundsSheet({ token, onClose, debugSource }: TravelFundsSheetProps) {
  const currentLocalDayStart = getLocalDayStart();
  const config = useQuery(tripcastApi.travelFunds.travelerGetConfig, {
    token,
    currentLocalDayStart,
  });
  const transactions = useQuery(tripcastApi.travelFunds.travelerListTransactions, { token });
  const updateConfig = useMutation(tripcastApi.travelFunds.travelerUpdateConfig);
  const addTransaction = useMutation(tripcastApi.travelFunds.travelerAddTransaction);
  const updateTransaction = useMutation(tripcastApi.travelFunds.travelerUpdateTransaction);
  const deleteTransaction = useMutation(tripcastApi.travelFunds.travelerDeleteTransaction);

  const [view, setView] = useState<View>("summary");
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [pendingDeleteTx, setPendingDeleteTx] = useState<Transaction | null>(null);
  const [isSwipeDeleting, setIsSwipeDeleting] = useState(false);

  const [budgetInput, setBudgetInput] = useState<string>("");
  const [budgetMode, setBudgetMode] = useState<BudgetMode>("daily");
  const [startDateInput, setStartDateInput] = useState<string>(() =>
    formatDateInput(currentLocalDayStart),
  );
  const [carryoverMode, setCarryoverMode] = useState<CarryoverMode>("none");
  const [labelInput, setLabelInput] = useState<string>("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const music = useMusicSafe();
  const log = useDebugLogger("TravelFundsSheet", "src/features/travelfunds/TravelFundsSheet.tsx");
  useActiveUiContext(true, {
    sheetName: "TravelFundsSheet",
    label: TERMS.travelFunds,
    view,
    source: debugSource?.source ?? "unknown",
    sourceLabel: debugSource?.sourceLabel ?? "Unknown",
    file: "src/features/travelfunds/TravelFundsSheet.tsx",
  }, { boundsSelector: "[data-role='travel-funds-sheet']" });

  function openSettings() {
    log.logInteraction("view:change", { from: view, to: "settings" });
    music.sfx("page");
    if (config?.enabled) {
      setBudgetInput(String(config.startingBudgetUsd));
      setBudgetMode(config.budgetMode ?? "trip");
      setStartDateInput(formatDateInput(config.fundsStartAt ?? currentLocalDayStart));
      setCarryoverMode(config.carryoverMode ?? "none");
      setLabelInput(config.budgetLabel ?? "");
    } else {
      setBudgetInput("");
      setBudgetMode("daily");
      setStartDateInput(formatDateInput(currentLocalDayStart));
      setCarryoverMode("none");
      setLabelInput("");
    }
    setSettingsError(null);
    setView("settings");
  }

  async function handleToggleFeature() {
    const next = !(config?.enabled ?? false);
    try {
      await updateConfig({ token, featureEnabled: next });
      music.sfx("success");
    } catch (err) {
      setSettingsError(friendlyTravelFundsError(err));
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    setSettingsError(null);
    try {
      const budget = budgetInput.trim() === "" ? 0 : Number(budgetInput);
      if (!Number.isFinite(budget) || budget < 0) {
        setSettingsError("Starting budget must be a non-negative number.");
        setSavingSettings(false);
        return;
      }
      if (budget > MAX_STARTING_BUDGET_USD) {
        setSettingsError("Starting budget must be between $0 and $10,000,000.");
        setSavingSettings(false);
        return;
      }
      const fundsStartAt = budgetMode === "daily" ? parseDateInput(startDateInput) : undefined;
      if (budgetMode === "daily" && fundsStartAt === null) {
        setSettingsError("Start date is required for daily funds.");
        setSavingSettings(false);
        return;
      }
      await updateConfig({
        token,
        featureEnabled: true,
        startingBudgetUsd: budget,
        budgetMode,
        carryoverMode: budgetMode === "daily" ? carryoverMode : "none",
        ...(fundsStartAt !== undefined && fundsStartAt !== null && { fundsStartAt }),
        budgetLabel: labelInput.trim() === "" ? "" : labelInput.trim(),
      });
      music.sfx("success");
      setView("summary");
    } catch (err) {
      setSettingsError(friendlyTravelFundsError(err));
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleAddSubmit(values: TransactionFormValues) {
    log.logInteraction("transaction:submit", { action: "add", currencyCode: values.currencyCode });
    await addTransaction({ token, ...values });
    log.logInteraction("submit:success", { action: "add" });
    music.sfx("success");
    setView("summary");
  }

  async function handleEditSubmit(values: TransactionFormValues) {
    if (!editingTx) return;
    log.logInteraction("transaction:submit", { action: "edit", transactionId: editingTx._id });
    await updateTransaction({
      token,
      transactionId: editingTx._id,
      ...values,
    });
    log.logInteraction("submit:success", { action: "edit" });
    music.sfx("success");
    setEditingTx(null);
    setView("summary");
  }

  async function handleDelete() {
    if (!editingTx) return;
    await deleteTransaction({ token, transactionId: editingTx._id });
    music.sfx("success");
    setEditingTx(null);
    setView("summary");
  }

  async function handleSwipeDelete() {
    if (!pendingDeleteTx || isSwipeDeleting) return;
    setIsSwipeDeleting(true);
    try {
      await deleteTransaction({ token, transactionId: pendingDeleteTx._id });
      music.sfx("success");
      setPendingDeleteTx(null);
    } catch {
      // Surface a no-op close on failure — the data subscription refreshes
      // anyway, so the row will either still be there (failed) or gone
      // (succeeded server-side after the throw, unlikely but defensive).
      setPendingDeleteTx(null);
    } finally {
      setIsSwipeDeleting(false);
    }
  }

  function goBackToSummary() {
    music.sfx("page");
    setEditingTx(null);
    setView("summary");
  }

  // -------------------------------------------------------------------------
  // View body
  // -------------------------------------------------------------------------

  const inSubView = view !== "summary";

  return (
    <div className="flex flex-col gap-3" data-funds-view={view}>
      {/* Local sub-view header: title + back button. Parent owns the outer
          sheet chrome; this band only renders when the user is inside a
          form (add / edit / settings) so they can navigate back. */}
      {inSubView ? (
        <div className="flex items-center gap-2 pb-1">
          <button
            type="button"
            onClick={goBackToSummary}
            aria-label="Back to funds summary"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-1)] transition-colors hover:bg-[var(--meter-track)]"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <h3 className="font-[var(--font-display)] text-base font-bold text-[var(--ink-1)]">
            {VIEW_TITLES[view]}
          </h3>
        </div>
      ) : null}

      {view === "add" && (
        <TransactionForm
          token={token}
          mode="add"
          onSubmit={handleAddSubmit}
          onCancel={goBackToSummary}
        />
      )}

      {view === "edit" && editingTx && (
        <TransactionForm
          token={token}
          mode="edit"
          initial={editingTx}
          onSubmit={handleEditSubmit}
          onCancel={goBackToSummary}
          onDelete={handleDelete}
        />
      )}

      {view === "settings" && (
          <SettingsBody
            enabled={config?.enabled ?? false}
            budgetInput={budgetInput}
            budgetMode={budgetMode}
            startDateInput={startDateInput}
            carryoverMode={carryoverMode}
            labelInput={labelInput}
            onBudgetChange={setBudgetInput}
            onBudgetModeChange={setBudgetMode}
            onStartDateChange={setStartDateInput}
            onCarryoverModeChange={setCarryoverMode}
            onLabelChange={setLabelInput}
          onToggleFeature={handleToggleFeature}
          onCancel={goBackToSummary}
          onSave={handleSaveSettings}
          saving={savingSettings}
          error={settingsError}
          hasTransactions={!!(transactions && transactions.length > 0)}
        />
      )}

      {view === "summary" &&
        (config === undefined ? (
          <p className="py-6 text-center text-sm text-[var(--ink-3)]">Loading…</p>
        ) : !config.enabled ? (
          <DisabledState onEnable={openSettings} onClose={onClose} />
        ) : (
          <SummaryView
            startingBudgetUsd={config.startingBudgetUsd}
            remainingUsd={config.remainingUsd}
            spentUsd={config.spentUsd}
            budgetMode={config.budgetMode ?? "trip"}
            carryoverDebtUsd={config.carryoverDebtUsd ?? 0}
            budgetLabel={config.budgetLabel}
            transactions={transactions ?? []}
            onAdd={() => {
              log.logInteraction("view:change", { from: view, to: "add" });
              music.sfx("page");
              setView("add");
            }}
            onSettings={openSettings}
            onSelectTransaction={(tx) => {
              log.logInteraction("view:change", { from: view, to: "edit", transactionId: tx._id });
              music.sfx("page");
              setEditingTx(tx);
              setView("edit");
            }}
            onRequestDelete={(tx) => setPendingDeleteTx(tx)}
          />
        ))}

      <ConfirmDelete
        open={pendingDeleteTx !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteTx(null);
        }}
        title="Delete this transaction?"
        itemLabel={pendingDeleteTx?.title ?? undefined}
        description="The spend disappears from the Travel Funds list and the meter recalculates. This can't be undone."
        onConfirm={handleSwipeDelete}
        pending={isSwipeDeleting}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary view — big-number remaining + per-day + days-left tiles + tx list
// ---------------------------------------------------------------------------

function SummaryView({
  startingBudgetUsd,
  remainingUsd,
  spentUsd,
  budgetMode,
  carryoverDebtUsd,
  budgetLabel,
  transactions,
  onAdd,
  onSettings,
  onSelectTransaction,
  onRequestDelete,
}: {
  startingBudgetUsd: number;
  remainingUsd: number;
  spentUsd: number;
  budgetMode: BudgetMode;
  carryoverDebtUsd: number;
  budgetLabel?: string;
  transactions: Transaction[];
  onAdd: () => void;
  onSettings: () => void;
  onSelectTransaction: (tx: Transaction) => void;
  onRequestDelete: (tx: Transaction) => void;
}) {
  const { funds: fundsPersonality } = useSheetPersonalities();
  const over = remainingUsd < 0;
  const noBudget = startingBudgetUsd <= 0;
  const fillPct = noBudget
    ? 0
    : over
      ? Math.min(100, (Math.abs(remainingUsd) / startingBudgetUsd) * 100)
      : Math.max(0, Math.min(100, (remainingUsd / startingBudgetUsd) * 100));
  const ratioLow = !over && !noBudget && remainingUsd / startingBudgetUsd < 0.25;
  const barColor = noBudget
    ? "var(--meter-track)"
    : over
      ? "var(--flag)"
      : ratioLow
        ? "var(--amber)"
        : "var(--green)";
  const amountText = over
    ? `-${formatUsd(Math.abs(remainingUsd))}`
    : formatUsd(remainingUsd);
  const captionText = over
    ? "OVER BUDGET"
    : noBudget
      ? budgetMode === "daily" ? "NO DAILY BUDGET SET" : "NO BUDGET SET"
      : budgetMode === "daily"
        ? `OF ${formatUsd(startingBudgetUsd)} TODAY`
        : `OF ${formatUsd(startingBudgetUsd)} BUDGET`;
  const spentLabel = budgetMode === "daily" ? "Today" : "Spent";

  return (
    <>
      <div
        className="flex flex-col gap-2 rounded-2xl border bg-[var(--bg-card)] px-4 py-4 shadow-[var(--shadow-card)]"
        style={{ borderColor: "color-mix(in oklab, var(--teal) 38%, var(--line-soft))" }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--ink-on-brand)] shadow-sm"
              style={{ background: fundsPersonality.color }}
              aria-hidden="true"
            >
              <DollarSign className="h-[18px] w-[18px]" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span
                className={cn(
                  "font-[var(--font-display)] text-3xl font-extrabold leading-tight tracking-tight",
                  over ? "text-[var(--flag)]" : "text-[var(--ink-1)]",
                )}
              >
                {amountText}
              </span>
              <span className="mt-0.5 font-[var(--font-mono)] text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                {captionText}
              </span>
            </span>
          </div>
          <div className="text-right">
            <span className="block font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              {spentLabel}
            </span>
            <span className="font-[var(--font-display)] text-base font-bold text-[var(--ink-1)]">
              {formatUsd(spentUsd)}
            </span>
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-[var(--meter-track)]">
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${fillPct}%`, background: barColor }}
          />
        </div>

        {budgetLabel ? (
          <p className="truncate text-[11px] italic text-[var(--ink-3)]">{budgetLabel}</p>
        ) : null}
        {budgetMode === "daily" && carryoverDebtUsd > 0 ? (
          <p className="text-[11px] text-[var(--ink-3)]">
            Prior overspending reduces today by {formatUsd(carryoverDebtUsd)}.
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <h4 className="font-[var(--font-mono)] text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
          Recent transactions
        </h4>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onSettings} aria-label="Funds settings">
            <SettingsIcon className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button size="sm" type="button" onClick={onAdd} className="rounded-full">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Spend
          </Button>
        </div>
      </div>

      <div className="-mx-1 max-h-72 overflow-y-auto px-1">
        <TransactionRows
          transactions={transactions}
          onSelect={onSelectTransaction}
          onRequestDelete={onRequestDelete}
        />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Disabled state — feature off / no budget
// ---------------------------------------------------------------------------

function DisabledState({ onEnable, onClose }: { onEnable: () => void; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-[var(--bg-card)] px-4 py-5 shadow-[var(--shadow-card)]">
      <p className="text-sm text-[var(--ink-2)]">
        Travel funds are off. Enable them to set a starting budget and start logging transactions.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button onClick={onEnable}>Enable</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings body
// ---------------------------------------------------------------------------

function SettingsBody({
  enabled,
  budgetInput,
  budgetMode,
  startDateInput,
  carryoverMode,
  labelInput,
  onBudgetChange,
  onBudgetModeChange,
  onStartDateChange,
  onCarryoverModeChange,
  onLabelChange,
  onToggleFeature,
  onCancel,
  onSave,
  saving,
  error,
  hasTransactions,
}: {
  enabled: boolean;
  budgetInput: string;
  budgetMode: BudgetMode;
  startDateInput: string;
  carryoverMode: CarryoverMode;
  labelInput: string;
  onBudgetChange: (value: string) => void;
  onBudgetModeChange: (value: BudgetMode) => void;
  onStartDateChange: (value: string) => void;
  onCarryoverModeChange: (value: CarryoverMode) => void;
  onLabelChange: (value: string) => void;
  onToggleFeature: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
  hasTransactions: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-[var(--bg-card)] px-4 py-4 shadow-[var(--shadow-card)]">
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggleFeature}
          className="mt-0.5"
        />
        <span className="flex flex-col">
          <span className="text-sm font-semibold text-[var(--ink-1)]">Enable travel funds</span>
          <span className="text-[11px] text-[var(--ink-3)]">
            Turning this off hides the meter from everyone. Transactions and budget are preserved.
          </span>
        </span>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-[var(--ink-3)]">Budget period</span>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-[var(--meter-track)] p-1">
          {(["trip", "daily"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onBudgetModeChange(mode)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                budgetMode === mode
                  ? "bg-[var(--bg-card)] text-[var(--ink-1)] shadow-sm"
                  : "text-[var(--ink-3)] hover:text-[var(--ink-1)]",
              )}
            >
              {mode === "trip" ? "Trip" : "Daily"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--ink-3)]" htmlFor="tf-budget">
          {budgetMode === "daily" ? "Daily budget (USD)" : "Starting budget (USD)"}
        </label>
        <Input
          id="tf-budget"
          value={budgetInput}
          onChange={(e) => onBudgetChange(e.target.value)}
          inputMode="decimal"
          placeholder="e.g. 1500"
        />
      </div>

      {budgetMode === "daily" ? (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--ink-3)]" htmlFor="tf-start-date">
              Start date
            </label>
            <Input
              id="tf-start-date"
              type="date"
              value={startDateInput}
              onChange={(e) => onStartDateChange(e.target.value)}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={carryoverMode === "overspend_only"}
              onChange={(e) =>
                onCarryoverModeChange(e.target.checked ? "overspend_only" : "none")
              }
              className="mt-0.5"
            />
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-[var(--ink-1)]">
                Carry overspending forward
              </span>
              <span className="text-[11px] text-[var(--ink-3)]">
                Overspent days reduce later daily funds until the balance recovers.
              </span>
            </span>
          </label>
        </>
      ) : null}

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--ink-3)]" htmlFor="tf-label">
          Label (optional)
        </label>
        <Input
          id="tf-label"
          value={labelInput}
          onChange={(e) => onLabelChange(e.target.value)}
          maxLength={60}
          placeholder="e.g. Tokyo trip"
        />
      </div>

      {enabled && hasTransactions && (
        <p className="rounded-md px-2 py-1 text-[11px] text-[var(--ink-1)]" style={{ background: "color-mix(in oklab, var(--amber) 14%, transparent)" }}>
          Changing the starting budget recalculates remaining travel funds.
        </p>
      )}

      {error && (
        <p className="rounded-md border border-[var(--ink-danger)] bg-[var(--bg-danger)] px-3 py-2 text-xs text-[var(--ink-danger)]" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

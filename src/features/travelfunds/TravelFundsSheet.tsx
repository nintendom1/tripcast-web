import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ChevronLeft, Plus, Settings as SettingsIcon } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { Transaction } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { SwipeRow } from "../../components/ui/SwipeRow";
import { ConfirmDelete } from "../../components/ui/ConfirmDelete";
import { cn } from "@/lib/utils";
import { formatLocal, formatUsd, getCategoryEmoji, getCategoryLabel } from "./currency";
import TransactionForm, { type TransactionFormValues } from "./TransactionForm";
import { useMusicSafe } from "../../providers/MusicProvider";

type TravelFundsSheetProps = {
  token: string;
  onClose: () => void;
};

type View = "summary" | "add" | "edit" | "settings";

const VIEW_TITLES: Record<View, string> = {
  summary: "Travel funds",
  add: "Add spending",
  edit: "Edit transaction",
  settings: "Funds settings",
};

export default function TravelFundsSheet({ token, onClose }: TravelFundsSheetProps) {
  const config = useQuery(tripcastApi.travelFunds.travelerGetConfig, { token });
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
  const [labelInput, setLabelInput] = useState<string>("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const music = useMusicSafe();

  function openSettings() {
    music.sfx("page");
    if (config?.enabled) {
      setBudgetInput(String(config.startingBudgetUsd));
      setLabelInput(config.budgetLabel ?? "");
    } else {
      setBudgetInput("");
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
      setSettingsError(err instanceof Error ? err.message : String(err));
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
      await updateConfig({
        token,
        featureEnabled: true,
        startingBudgetUsd: budget,
        budgetLabel: labelInput.trim() === "" ? "" : labelInput.trim(),
      });
      music.sfx("success");
      setView("summary");
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleAddSubmit(values: TransactionFormValues) {
    await addTransaction({ token, ...values });
    music.sfx("success");
    setView("summary");
  }

  async function handleEditSubmit(values: TransactionFormValues) {
    if (!editingTx) return;
    await updateTransaction({
      token,
      transactionId: editingTx._id,
      ...values,
    });
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
          labelInput={labelInput}
          onBudgetChange={setBudgetInput}
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
            budgetLabel={config.budgetLabel}
            transactions={transactions ?? []}
            onAdd={() => {
              music.sfx("page");
              setView("add");
            }}
            onSettings={openSettings}
            onSelectTransaction={(tx) => {
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
  budgetLabel?: string;
  transactions: Transaction[];
  onAdd: () => void;
  onSettings: () => void;
  onSelectTransaction: (tx: Transaction) => void;
  onRequestDelete: (tx: Transaction) => void;
}) {
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
      ? "NO BUDGET SET"
      : `OF ${formatUsd(startingBudgetUsd)} BUDGET`;

  return (
    <>
      <div className="flex flex-col gap-2 rounded-2xl bg-[var(--bg-card)] px-4 py-4 shadow-[var(--shadow-card)]">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 flex-col">
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
          </div>
          <div className="text-right">
            <span className="block font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Spent
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

function TransactionRows({
  transactions,
  onSelect,
  onRequestDelete,
}: {
  transactions: Transaction[];
  onSelect: (tx: Transaction) => void;
  onRequestDelete: (tx: Transaction) => void;
}) {
  const [swipedId, setSwipedId] = useState<string | null>(null);
  if (transactions.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[var(--ink-3)]">
        No transactions yet. Tap "Spend" to add one.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {transactions.map((tx) => {
        const isUsd = tx.currencyCode === "USD";
        const isNegative = tx.usdAmount < 0;
        const row = (
          <button
            type="button"
            onClick={() => onSelect(tx)}
            className="flex w-full items-start gap-3 rounded-2xl bg-[var(--bg-card)] px-3 py-2.5 text-left shadow-[var(--shadow-card)] transition-transform active:scale-[0.99]"
            aria-label={`Edit ${tx.title}`}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg-paper-2)] text-base"
              aria-hidden="true"
            >
              {getCategoryEmoji(tx.category)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-[var(--font-display)] text-sm font-bold text-[var(--ink-1)]">
                  {tx.title}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-[var(--font-display)] text-sm font-bold",
                    isNegative ? "text-[var(--green)]" : "text-[var(--ink-1)]",
                  )}
                >
                  {formatUsd(tx.usdAmount)}
                </span>
              </span>
              <span className="flex items-baseline justify-between gap-2 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                <span className="truncate">
                  {getCategoryLabel(tx.category)} · {formatDate(tx.occurredAt)}
                  {!isUsd && <> · {formatLocal(tx.localAmount, tx.currencyCode)}</>}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {!tx.countsTowardMeter && (
                    <span className="rounded-full bg-[var(--meter-track)] px-1.5 py-0.5 text-[9px] tracking-normal text-[var(--ink-2)]">
                      Not counted
                    </span>
                  )}
                  {tx.visibility === "summary_only" && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] tracking-normal text-[var(--ink-1)]"
                      style={{ background: "color-mix(in oklab, var(--amber) 18%, transparent)" }}
                    >
                      Summary
                    </span>
                  )}
                  {tx.visibility === "private" && (
                    <span className="rounded-full bg-[var(--meter-track)] px-1.5 py-0.5 text-[9px] tracking-normal text-[var(--ink-2)]">
                      Private
                    </span>
                  )}
                </span>
              </span>
            </span>
          </button>
        );
        return (
          <li key={tx._id}>
            <SwipeRow
              id={tx._id}
              openId={swipedId}
              onOpenChange={setSwipedId}
              onEdit={() => onSelect(tx)}
              onDelete={() => onRequestDelete(tx)}
            >
              {row}
            </SwipeRow>
          </li>
        );
      })}
    </ul>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
  labelInput,
  onBudgetChange,
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
  labelInput: string;
  onBudgetChange: (value: string) => void;
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
        <label className="text-xs font-medium text-[var(--ink-3)]" htmlFor="tf-budget">
          Starting budget (USD)
        </label>
        <Input
          id="tf-budget"
          value={budgetInput}
          onChange={(e) => onBudgetChange(e.target.value)}
          inputMode="decimal"
          placeholder="e.g. 1500"
        />
      </div>

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
        <p className="rounded-md px-2 py-1 text-[11px] text-[var(--amber-2)]" style={{ background: "color-mix(in oklab, var(--amber) 14%, transparent)" }}>
          Changing the starting budget recalculates remaining travel funds.
        </p>
      )}

      {error && (
        <p className="text-xs text-[var(--danger)]" role="alert">
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

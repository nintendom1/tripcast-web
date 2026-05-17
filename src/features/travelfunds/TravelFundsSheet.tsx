import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { Transaction } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { formatUsd } from "./currency";
import TravelFundsMeter from "./TravelFundsMeter";
import TransactionList, { TransactionListActions } from "./TransactionList";
import TransactionForm, { type TransactionFormValues } from "./TransactionForm";

type TravelFundsSheetProps = {
  token: string;
  onClose: () => void;
};

type View = "summary" | "add" | "edit" | "settings";

export default function TravelFundsSheet({ token, onClose }: TravelFundsSheetProps) {
  const config = useQuery(tripcastApi.travelFunds.travelerGetConfig, { token });
  const transactions = useQuery(tripcastApi.travelFunds.travelerListTransactions, { token });
  const updateConfig = useMutation(tripcastApi.travelFunds.travelerUpdateConfig);
  const addTransaction = useMutation(tripcastApi.travelFunds.travelerAddTransaction);
  const updateTransaction = useMutation(tripcastApi.travelFunds.travelerUpdateTransaction);
  const deleteTransaction = useMutation(tripcastApi.travelFunds.travelerDeleteTransaction);

  const [view, setView] = useState<View>("summary");
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const [budgetInput, setBudgetInput] = useState<string>("");
  const [labelInput, setLabelInput] = useState<string>("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  function openSettings() {
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
      setView("summary");
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleAddSubmit(values: TransactionFormValues) {
    await addTransaction({ token, ...values });
    setView("summary");
  }

  async function handleEditSubmit(values: TransactionFormValues) {
    if (!editingTx) return;
    await updateTransaction({
      token,
      transactionId: editingTx._id,
      ...values,
    });
    setEditingTx(null);
    setView("summary");
  }

  async function handleDelete() {
    if (!editingTx) return;
    await deleteTransaction({ token, transactionId: editingTx._id });
    setEditingTx(null);
    setView("summary");
  }

  // -------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------

  if (view === "add") {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Add transaction</h3>
        <TransactionForm
          token={token}
          mode="add"
          onSubmit={handleAddSubmit}
          onCancel={() => setView("summary")}
        />
      </div>
    );
  }

  if (view === "edit" && editingTx) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Edit transaction</h3>
        <TransactionForm
          token={token}
          mode="edit"
          initial={editingTx}
          onSubmit={handleEditSubmit}
          onCancel={() => {
            setEditingTx(null);
            setView("summary");
          }}
          onDelete={handleDelete}
        />
      </div>
    );
  }

  if (view === "settings") {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Travel Funds settings</h3>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config?.enabled ?? false}
            onChange={handleToggleFeature}
            className="mt-0.5"
          />
          <span className="flex flex-col">
            <span className="text-sm">Enable Travel Funds</span>
            <span className="text-[11px] text-muted-foreground">
              Turning this off hides the meter from everyone. Transactions and budget are preserved.
            </span>
          </span>
        </label>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" htmlFor="tf-budget">Starting budget (USD)</label>
          <Input
            id="tf-budget"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 1500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" htmlFor="tf-label">Label (optional)</label>
          <Input
            id="tf-label"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            maxLength={60}
            placeholder="e.g. Tokyo trip"
          />
        </div>

        {config?.enabled && transactions && transactions.length > 0 && (
          <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
            Changing the starting budget recalculates remaining Travel Funds.
          </p>
        )}

        {settingsError && (
          <p className="text-xs text-rose-600" role="alert">{settingsError}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => setView("summary")} disabled={savingSettings}>
            Cancel
          </Button>
          <Button onClick={handleSaveSettings} disabled={savingSettings}>
            {savingSettings ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  // Summary view
  if (config === undefined) {
    return <p className="text-sm text-muted-foreground py-4">Loading…</p>;
  }

  if (!config.enabled) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Travel Funds</h3>
        <p className="text-sm text-muted-foreground">
          Travel Funds are turned off. Enable them to set a starting budget and log transactions.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={openSettings}>Enable</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <TravelFundsMeter
          startingBudgetUsd={config.startingBudgetUsd}
          remainingUsd={config.remainingUsd}
          label={config.budgetLabel}
          variant="full"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Spent {formatUsd(config.spentUsd)} of {formatUsd(config.startingBudgetUsd)}
        </p>
      </div>

      <div className="flex justify-between items-center">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Transactions
        </h4>
        <Button size="sm" variant="ghost" onClick={openSettings}>Settings</Button>
      </div>

      <TransactionListActions onAdd={() => setView("add")} />

      <div className="max-h-72 overflow-y-auto -mx-1 px-1">
        <TransactionList
          transactions={transactions ?? []}
          onEdit={(tx) => {
            setEditingTx(tx);
            setView("edit");
          }}
        />
      </div>
    </div>
  );
}

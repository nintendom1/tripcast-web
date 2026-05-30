import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, X } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { Transaction } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { formatUsd } from "./currency";
import TransactionForm, { type TransactionFormValues } from "./TransactionForm";
import TransactionRows from "./TransactionRows";
import TransactionPickerSheet, {
  type TransactionPickerTarget,
} from "./TransactionPickerSheet";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useMusicSafe } from "../../providers/MusicProvider";

type LinkedTransactionsSectionProps =
  | {
      token: string;
      mode: "linked";
      target: TransactionPickerTarget;
    }
  | {
      token: string;
      mode: "staging";
      staged: Transaction[];
      onStagedChange: (next: Transaction[]) => void;
    };

type EditState = { tx: Transaction } | null;

export default function LinkedTransactionsSection(props: LinkedTransactionsSectionProps) {
  if (props.mode === "linked") {
    return <LinkedMode token={props.token} target={props.target} />;
  }
  return (
    <StagingMode
      token={props.token}
      staged={props.staged}
      onStagedChange={props.onStagedChange}
    />
  );
}

// ---------------------------------------------------------------------------
// Linked mode — list + edit transactions tied to a real Mission or Story.
// ---------------------------------------------------------------------------

function LinkedMode({
  token,
  target,
}: {
  token: string;
  target: TransactionPickerTarget;
}) {
  const log = useDebugLogger(
    "LinkedTransactionsSection",
    "src/features/travelfunds/LinkedTransactionsSection.tsx",
  );
  const music = useMusicSafe();

  const config = useQuery(tripcastApi.travelFunds.travelerGetConfig, { token });
  const transactions = useQuery(
    tripcastApi.travelFunds.travelerListTransactionsForTarget,
    config?.enabled
      ? { token, targetType: target.type, targetId: target.id }
      : "skip",
  );

  const updateTransaction = useMutation(tripcastApi.travelFunds.travelerUpdateTransaction);
  const deleteTransaction = useMutation(tripcastApi.travelFunds.travelerDeleteTransaction);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<EditState>(null);

  const total = useTransactionTotal(transactions ?? undefined);

  if (config === undefined) return null;
  if (!config.enabled) return null;

  async function handleEditSubmit(values: TransactionFormValues) {
    if (!editing) return;
    log.logFunds("transaction:edit:start", {
      transactionId: editing.tx._id,
      targetType: target.type,
    });
    try {
      await updateTransaction({ token, transactionId: editing.tx._id, ...values });
      log.logFunds("transaction:edit:success", { transactionId: editing.tx._id });
      music.sfx("success");
      setEditing(null);
    } catch (e) {
      log.error("transaction:edit:error", "funds", {
        transactionId: editing.tx._id,
        message: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  async function handleEditDelete() {
    if (!editing) return;
    log.logFunds("transaction:delete:start", { transactionId: editing.tx._id });
    try {
      await deleteTransaction({ token, transactionId: editing.tx._id });
      log.logFunds("transaction:delete:success", { transactionId: editing.tx._id });
      music.sfx("success");
      setEditing(null);
    } catch (e) {
      log.error("transaction:delete:error", "funds", {
        transactionId: editing.tx._id,
        message: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  async function handleEditUnlink() {
    if (!editing) return;
    log.logFunds("transaction:unlink:start", {
      transactionId: editing.tx._id,
      targetType: target.type,
      targetId: target.id,
    });
    try {
      await updateTransaction({
        token,
        transactionId: editing.tx._id,
        clearLinks: [target.type === "mission" ? "mission" : "checkpoint"],
      });
      log.logFunds("transaction:unlink:success", { transactionId: editing.tx._id });
      music.sfx("success");
      setEditing(null);
    } catch (e) {
      log.error("transaction:unlink:error", "funds", {
        transactionId: editing.tx._id,
        message: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Transactions"
        total={total}
        onAddLink={() => {
          log.logFunds("transaction-picker:open", {
            targetType: target.type,
            targetId: target.id,
          });
          setPickerOpen(true);
        }}
      />

      {transactions === undefined ? (
        <p className="text-xs text-[var(--ink-3)]">Loading…</p>
      ) : editing ? (
        <div className="rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] p-3">
          <TransactionForm
            token={token}
            mode="edit"
            initial={editing.tx}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditing(null)}
            onDelete={handleEditDelete}
            onUnlink={handleEditUnlink}
          />
        </div>
      ) : (
        <TransactionRows
          transactions={transactions}
          onSelect={(tx) => setEditing({ tx })}
          compact
          emptyMessage="No transactions linked yet."
        />
      )}

      <TransactionPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        token={token}
        target={target}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Staging mode — pre-creation list of "to-be-linked" transactions.
// No backend query: the row list is controlled by the parent, which links
// each row to the new parent record after save.
// ---------------------------------------------------------------------------

function StagingMode({
  token,
  staged,
  onStagedChange,
}: {
  token: string;
  staged: Transaction[];
  onStagedChange: (next: Transaction[]) => void;
}) {
  const log = useDebugLogger(
    "LinkedTransactionsSection",
    "src/features/travelfunds/LinkedTransactionsSection.tsx",
  );
  const config = useQuery(tripcastApi.travelFunds.travelerGetConfig, { token });
  const [pickerOpen, setPickerOpen] = useState(false);

  const total = useTransactionTotal(staged);

  if (config === undefined) return null;
  if (!config.enabled) return null;

  function pushStaged(tx: Transaction) {
    if (staged.some((s) => s._id === tx._id)) return;
    log.logFunds("transaction:stage", {
      transactionId: tx._id,
      title: tx.title,
      usdAmount: tx.usdAmount,
    });
    onStagedChange([...staged, tx]);
  }

  function unstage(tx: Transaction) {
    log.logFunds("transaction:unstage", { transactionId: tx._id });
    onStagedChange(staged.filter((s) => s._id !== tx._id));
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Transactions to link"
        total={total}
        onAddLink={() => {
          log.logFunds("transaction-picker:open", { targetType: "none" });
          setPickerOpen(true);
        }}
      />

      {staged.length === 0 ? (
        <p className="py-2 text-xs text-[var(--ink-3)]">
          None yet. Tap "Add / Link" to attach a transaction; it'll be linked when you save.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {staged.map((tx) => (
            <li
              key={tx._id}
              className="flex items-center gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-[var(--font-display)] text-sm font-bold text-[var(--ink-1)]">
                  {tx.title}
                </span>
                <span className="block font-[var(--font-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  {formatUsd(tx.usdAmount)}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${tx.title} from staged transactions`}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-2)] hover:bg-[var(--meter-track)] hover:text-[var(--ink-1)]"
                onClick={() => unstage(tx)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <TransactionPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        token={token}
        target={null}
        onPickedExisting={pushStaged}
        onAdded={pushStaged}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function SectionHeader({
  title,
  total,
  onAddLink,
}: {
  title: string;
  total: number;
  onAddLink: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-baseline gap-2">
        <h4 className="font-[var(--font-mono)] text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
          {title}
        </h4>
        <span className="font-[var(--font-display)] text-sm font-bold text-[var(--ink-1)]">
          {formatUsd(total)}
        </span>
      </div>
      <Button size="sm" type="button" onClick={onAddLink} className="rounded-full">
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Add / Link
      </Button>
    </div>
  );
}

function useTransactionTotal(transactions: Transaction[] | undefined): number {
  return useMemo(() => {
    if (!transactions) return 0;
    let sum = 0;
    for (const tx of transactions) {
      if (tx.countsTowardMeter) sum += tx.usdAmount;
    }
    return Math.round(sum * 100) / 100;
  }, [transactions]);
}

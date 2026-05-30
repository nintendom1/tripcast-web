import { useState } from "react";

import type { Transaction } from "../../convex/tripcastApi";
import { SwipeRow } from "../../components/ui/SwipeRow";
import { cn } from "@/lib/utils";
import { formatLocal, formatUsd, getCategoryEmoji, getCategoryLabel } from "./currency";

type TransactionRowsProps = {
  transactions: Transaction[];
  onSelect: (tx: Transaction) => void;
  /** When provided, each row gets a swipe-to-delete affordance. Omit in
   *  read-only/picker contexts where deletion isn't appropriate. */
  onRequestDelete?: (tx: Transaction) => void;
  /** Compact mode tightens spacing for embedded use (detail sheets, pickers). */
  compact?: boolean;
  emptyMessage?: string;
};

export default function TransactionRows({
  transactions,
  onSelect,
  onRequestDelete,
  compact = false,
  emptyMessage = 'No transactions yet. Tap "Spend" to add one.',
}: TransactionRowsProps) {
  const [swipedId, setSwipedId] = useState<string | null>(null);

  if (transactions.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[var(--ink-3)]">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {transactions.map((tx) => {
        const row = (
          <TransactionRowCard tx={tx} onSelect={onSelect} compact={compact} />
        );
        if (!onRequestDelete) {
          return <li key={tx._id}>{row}</li>;
        }
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

function TransactionRowCard({
  tx,
  onSelect,
  compact,
}: {
  tx: Transaction;
  onSelect: (tx: Transaction) => void;
  compact: boolean;
}) {
  const isUsd = tx.currencyCode === "USD";
  const isNegative = tx.usdAmount < 0;
  return (
    <button
      type="button"
      onClick={() => onSelect(tx)}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] text-left shadow-[var(--shadow-card)] transition-transform active:scale-[0.99]",
        compact ? "px-2.5 py-2" : "px-3 py-2.5",
      )}
      aria-label={`Edit ${tx.title}`}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full",
          compact ? "h-7 w-7 text-sm" : "h-9 w-9 text-base",
        )}
        style={{ background: "color-mix(in oklab, var(--meadow-forest) 14%, var(--bg-paper))" }}
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
        <span className="flex items-start justify-between gap-2 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          <span className="min-w-0">
            <span className="block truncate">
              {getCategoryLabel(tx.category)} · {formatLedgerTimestamp(tx.occurredAt)}
            </span>
            {!isUsd && (
              <span className="block truncate normal-case tracking-normal text-[var(--ink-2)]">
                {formatLocal(tx.localAmount, tx.currencyCode)}
              </span>
            )}
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
}

function formatLedgerTimestamp(ms: number): string {
  const date = new Date(ms);
  const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

import type { Transaction } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { formatLocal, formatUsd, getCategoryEmoji, getCategoryLabel } from "./currency";

type TransactionListProps = {
  transactions: Transaction[];
  onEdit: (tx: Transaction) => void;
};

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function TransactionList({ transactions, onEdit }: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No transactions yet. Add one to see it here.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y">
      {transactions.map((tx) => {
        const isUsd = tx.currencyCode === "USD";
        const isNegative = tx.usdAmount < 0;
        return (
          <li key={tx._id} className="py-2 first:pt-0 last:pb-0">
            <button
              type="button"
              className="w-full flex items-start gap-2 text-left hover:bg-slate-50 rounded-md px-2 py-1 -mx-2"
              onClick={() => onEdit(tx)}
            >
              <span className="text-lg shrink-0" aria-hidden>{getCategoryEmoji(tx.category)}</span>
              <span className="flex-1 min-w-0">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium truncate">{tx.title}</span>
                  <span className={`text-sm font-semibold shrink-0 ${isNegative ? "text-emerald-700" : ""}`}>
                    {formatUsd(tx.usdAmount)}
                  </span>
                </span>
                <span className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">
                    {getCategoryLabel(tx.category)} · {formatDate(tx.occurredAt)}
                    {!isUsd && <> · {formatLocal(tx.localAmount, tx.currencyCode)}</>}
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    {!tx.countsTowardMeter && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">
                        Not counted
                      </span>
                    )}
                    {tx.visibility === "summary_only" && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">
                        Summary
                      </span>
                    )}
                    {tx.visibility === "private" && (
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px]">
                        Private
                      </span>
                    )}
                  </span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function TransactionListActions({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex justify-end">
      <Button size="sm" onClick={onAdd}>Add transaction</Button>
    </div>
  );
}

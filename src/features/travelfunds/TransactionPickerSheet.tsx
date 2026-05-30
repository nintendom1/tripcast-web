import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ChevronLeft, Plus } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { Transaction } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetGradientHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useSheetPersonalities } from "../redesign/sheetPersonality";
import TransactionForm, { type TransactionFormValues } from "./TransactionForm";
import TransactionRows from "./TransactionRows";

export type TransactionPickerTarget =
  | { type: "mission"; id: string }
  | { type: "checkpoint"; id: string };

type TransactionPickerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Linking target. When provided, the picker fires updateTransaction to link
   *  the chosen existing transaction directly. When null (pre-creation flows),
   *  the picker hands the picked transaction back to `onPickedExisting` so the
   *  caller can stage it and link after the parent record is created. */
  target: TransactionPickerTarget | null;
  /** Fires after a successful direct link (target provided). */
  onLinked?: (transactionId: string) => void;
  /** Fires when target is null and the user picks an unlinked transaction.
   *  Picker dismisses; caller is responsible for staging + linking. */
  onPickedExisting?: (tx: Transaction) => void;
  /** Fires after a successful "+ New" add. The new transaction carries the
   *  target's linkedXxxId already (when target was provided). The full
   *  Transaction is constructed optimistically client-side so staging
   *  consumers can render the row without a follow-up query. */
  onAdded?: (tx: Transaction) => void;
};

type View = "list" | "add";

export default function TransactionPickerSheet({
  open,
  onOpenChange,
  token,
  target,
  onLinked,
  onPickedExisting,
  onAdded,
}: TransactionPickerSheetProps) {
  const { funds: fundsPersonality } = useSheetPersonalities();
  const music = useMusicSafe();
  const log = useDebugLogger(
    "TransactionPickerSheet",
    "src/features/travelfunds/TransactionPickerSheet.tsx",
  );

  const [view, setView] = useState<View>("list");
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unlinked = useQuery(
    tripcastApi.travelFunds.travelerListUnlinkedTransactions,
    open ? { token } : "skip",
  );
  const addTransaction = useMutation(tripcastApi.travelFunds.travelerAddTransaction);
  const updateTransaction = useMutation(tripcastApi.travelFunds.travelerUpdateTransaction);

  function resetAndClose() {
    setView("list");
    setLinkingId(null);
    setError(null);
    onOpenChange(false);
  }

  async function handleSelectExisting(tx: Transaction) {
    setError(null);
    if (!target) {
      // Pre-creation staging mode — hand back to the caller and dismiss.
      log.logFunds("transaction:pick-existing", {
        transactionId: tx._id,
        mode: "staged",
      });
      onPickedExisting?.(tx);
      resetAndClose();
      return;
    }
    setLinkingId(tx._id);
    log.logFunds("transaction:link-existing:start", {
      transactionId: tx._id,
      targetType: target.type,
      targetId: target.id,
      existingLinkedActivityId: tx.linkedActivityId ?? null,
      existingLinkedMissionId: tx.linkedMissionId ?? null,
      existingLinkedCheckpointId: tx.linkedCheckpointId ?? null,
    });
    try {
      await updateTransaction({
        token,
        transactionId: tx._id,
        ...(target.type === "mission" ? { linkedMissionId: target.id } : {}),
        ...(target.type === "checkpoint" ? { linkedCheckpointId: target.id } : {}),
      });
      log.logFunds("transaction:link-existing:success", {
        transactionId: tx._id,
        targetType: target.type,
      });
      music.sfx("success");
      onLinked?.(tx._id);
      resetAndClose();
    } catch (e) {
      log.error("transaction:link-existing:error", "funds", {
        transactionId: tx._id,
        targetType: target.type,
        targetId: target.id,
        message: e instanceof Error ? e.message : String(e),
      });
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinkingId(null);
    }
  }

  async function handleAddSubmit(values: TransactionFormValues) {
    log.logFunds("transaction-picker:add-submit", {
      targetType: target?.type ?? "none",
      targetId: target?.id ?? null,
      linkedMissionId: values.linkedMissionId ?? null,
      linkedCheckpointId: values.linkedCheckpointId ?? null,
      linkedActivityId: values.linkedActivityId ?? null,
      currencyCode: values.currencyCode,
      localAmount: values.localAmount,
    });
    try {
      const newId = await addTransaction({ token, ...values });
      log.logFunds("transaction-picker:add-success", {
        transactionId: newId,
        targetType: target?.type ?? "none",
      });
      music.sfx("success");
      const now = Date.now();
      const usdAmount =
        Math.round((values.localAmount / values.localCurrencyPerUsd) * 100) / 100;
      const optimisticTx: Transaction = {
        _id: newId,
        _creationTime: now,
        title: values.title,
        note: values.note,
        category: values.category,
        currencyCode: values.currencyCode,
        localAmount: values.localAmount,
        localCurrencyPerUsd: values.localCurrencyPerUsd,
        usdAmount,
        countsTowardMeter: values.countsTowardMeter,
        visibility: values.visibility,
        linkedActivityId: values.linkedActivityId,
        linkedMissionId: values.linkedMissionId,
        linkedCheckpointId: values.linkedCheckpointId,
        occurredAt: values.occurredAt ?? now,
        createdAt: now,
        updatedAt: now,
      };
      onAdded?.(optimisticTx);
      resetAndClose();
    } catch (e) {
      log.error("transaction-picker:add-error", "funds", {
        message: e instanceof Error ? e.message : String(e),
        targetType: target?.type ?? "none",
        targetId: target?.id ?? null,
        linkedMissionId: values.linkedMissionId ?? null,
        linkedCheckpointId: values.linkedCheckpointId ?? null,
        linkedActivityId: values.linkedActivityId ?? null,
      });
      throw e;
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) resetAndClose();
        else {
          log.logInteraction("transaction-picker:open", {
            targetType: target?.type ?? "none",
            targetId: target?.id ?? null,
          });
          onOpenChange(true);
        }
      }}
    >
      <SheetContent
        side="bottom"
        showBackdrop={false}
        className="z-[20] max-h-[80dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
        data-role="transaction-picker-sheet"
      >
        <SheetGradientHeader color={fundsPersonality.color} bg={fundsPersonality.bg}>
          <div className="flex min-w-0 items-center gap-2">
            {view === "add" ? (
              <button
                type="button"
                onClick={() => setView("list")}
                aria-label="Back to transaction list"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-1)] transition-colors hover:bg-[var(--meter-track)]"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
            ) : null}
            <SheetTitle className="font-[var(--font-display)] text-lg font-extrabold text-[var(--ink-1)]">
              {view === "list" ? "Link or add a transaction" : "New transaction"}
            </SheetTitle>
          </div>
          <SheetCloseButton aria-label="Close" />
        </SheetGradientHeader>

        <SheetBody className="px-4 pb-4">
          {view === "list" ? (
            <div className="flex flex-col gap-3 pt-2">
              <Button
                type="button"
                size="sm"
                onClick={() => setView("add")}
                className="self-start rounded-full"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                New spend
              </Button>
              <h4 className="font-[var(--font-mono)] text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
                Unlinked transactions
              </h4>
              {unlinked === undefined ? (
                <p className="py-6 text-center text-sm text-[var(--ink-3)]">Loading…</p>
              ) : (
                <TransactionRows
                  transactions={unlinked}
                  onSelect={handleSelectExisting}
                  compact
                  emptyMessage="No unlinked transactions. Tap '+ New spend' to create one."
                />
              )}
              {linkingId ? (
                <p className="text-xs text-[var(--ink-3)]">Linking…</p>
              ) : null}
              {error ? (
                <p role="alert" className="text-xs text-[var(--ink-danger)]">{error}</p>
              ) : null}
            </div>
          ) : (
            <div className="pt-2">
              <TransactionForm
                token={token}
                mode="add"
                onSubmit={handleAddSubmit}
                onCancel={() => setView("list")}
                prefillMissionId={target?.type === "mission" ? target.id : undefined}
                prefillCheckpointId={target?.type === "checkpoint" ? target.id : undefined}
                submitLabel="Add & link"
              />
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

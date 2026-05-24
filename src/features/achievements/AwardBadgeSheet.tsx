import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { BadgeSourceType, BadgeType } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetGradientHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { cn } from "@/lib/utils";
import { useSheetPersonalities } from "../redesign/sheetPersonality";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useActiveUiContext } from "../../debug/useActiveUiContext";

type Props = {
  open: boolean;
  token: string;
  sourceType: BadgeSourceType;
  sourceId: string;
  onOpenChange: (open: boolean) => void;
};

const NOTE_MAX = 280;

export default function AwardBadgeSheet({
  open,
  token,
  sourceType,
  sourceId,
  onOpenChange,
}: Props) {
  const { awards: awardsPersonality } = useSheetPersonalities();
  const log = useDebugLogger(
    "AwardBadgeSheet",
    "src/features/achievements/AwardBadgeSheet.tsx",
  );
  const context = useQuery(
    tripcastApi.badges.travelerGetBadgeAwardContext,
    open ? { token, sourceType, sourceId } : "skip",
  );
  const awardBadges = useMutation(tripcastApi.badges.travelerAwardBadges);

  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [badgeType, setBadgeType] = useState<BadgeType | null>(null);
  const [note, setNote] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  useActiveUiContext(open, {
    sheetName: "AwardBadgeSheet",
    label: "Award Badge",
    view: badgeType ? "badge-selected" : "select-badge",
    source: "story-detail:award-badge",
    sourceLabel: "Story detail -> Award Badge",
    file: "src/features/achievements/AwardBadgeSheet.tsx",
  }, { boundsSelector: "[data-role='award-badge-sheet']" });

  // Default-select every attributed Follower the first time the context loads.
  useEffect(() => {
    if (open && context) {
      setSelectedRecipients(new Set(context.recipients.map((r) => r.idTag)));
      log.logUi("badge:award:open", {
        sourceType,
        recipientCount: context.recipients.length,
        visibleAttributionCount: context.recipients.filter((r) => !r.hiddenAttribution).length,
        hiddenAttributionCount: context.recipients.filter((r) => r.hiddenAttribution).length,
      });
      log.logUi("badge:available:list", { count: context.badges.length });
      if (context.recipients.length === 0) {
        log.logUi("badge:award:skipped:no-attribution", { sourceType });
      }
    }
    if (!open) {
      setBadgeType(null);
      setNote("");
      setError(null);
      setFeedback(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, context]);

  // idTags already awarded the currently-selected badge for this source.
  const awardedForBadge = useMemo(() => {
    if (!context || !badgeType) return new Set<string>();
    return new Set(
      context.awarded.filter((a) => a.badgeType === badgeType).map((a) => a.idTag),
    );
  }, [context, badgeType]);

  function toggleRecipient(idTag: string) {
    setSelectedRecipients((current) => {
      const next = new Set(current);
      if (next.has(idTag)) next.delete(idTag);
      else next.add(idTag);
      return next;
    });
    log.logUi("badge:award:recipient:toggle", { sourceType });
  }

  async function handleAward() {
    if (!context || !badgeType) return;
    setError(null);
    setFeedback(null);

    const chosen = context.recipients.filter(
      (r) => selectedRecipients.has(r.idTag) && !awardedForBadge.has(r.idTag),
    );
    if (chosen.length === 0) {
      setError("Select at least one recipient who hasn't already earned this badge.");
      return;
    }

    const recipients = chosen.map((r) =>
      r.userId ? { userId: r.userId } : { devSessionId: r.devSessionId! },
    );

    setIsWorking(true);
    log.logMutation("badge:award:attempt", {
      sourceType,
      badgeType,
      recipientCount: recipients.length,
      hasNote: note.trim().length > 0,
    });
    try {
      const result = await awardBadges({
        token,
        sourceType,
        sourceId,
        badgeType,
        recipients,
        note: note.trim() || undefined,
      });
      log.logMutation("badge:award:success", {
        badgeType,
        awardedCount: result.awardedCount,
        alreadyAwardedCount: result.alreadyAwardedCount,
        skippedNotAttributedCount: result.skippedNotAttributedCount,
      });
      if (result.alreadyAwardedCount > 0) {
        log.logUi("badge:award:skipped:duplicate", {
          badgeType,
          alreadyAwardedCount: result.alreadyAwardedCount,
        });
      }
      const parts: string[] = [];
      if (result.awardedCount > 0) parts.push(`Awarded to ${result.awardedCount}`);
      if (result.alreadyAwardedCount > 0)
        parts.push(`${result.alreadyAwardedCount} already had it`);
      if (result.skippedNotAttributedCount > 0)
        parts.push(`${result.skippedNotAttributedCount} skipped`);
      setFeedback(parts.join(" · ") || "Done.");
      setNote("");
    } catch (e) {
      log.error("badge:award:error", "mutation", { message: String(e) });
      setError(e instanceof Error ? e.message : "Unable to award badge.");
    } finally {
      setIsWorking(false);
    }
  }

  const hasRecipients = (context?.recipients.length ?? 0) > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-role="award-badge-sheet"
        className="max-h-[85dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
      >
        <SheetGradientHeader color={awardsPersonality.color} bg={awardsPersonality.bg}>
          <div className="grid gap-1">
            <SheetTitle className="text-base">
              {context?.sourceLabel ?? "Loading…"}
            </SheetTitle>
          </div>
          <SheetCloseButton />
        </SheetGradientHeader>

        <SheetBody className="grid gap-4 px-5">
          {!context ? (
            <p className="rounded-xl bg-[var(--bg-card)] p-3 text-sm text-[var(--ink-3)]">
              Loading…
            </p>
          ) : !hasRecipients ? (
            <div className="grid gap-2 rounded-xl bg-[var(--bg-card)] p-4 text-sm text-[var(--ink-2)]">
              <p className="font-semibold">No attributed Followers yet.</p>
              <p className="text-xs text-[var(--ink-3)]">
                Use “Edit credits” on the {sourceType === "mission" ? "Mission" : "Story"} to
                credit Followers, then award them a Badge.
              </p>
            </div>
          ) : (
            <>
              {/* Recipients */}
              <section className="grid gap-2">
                <h3 className="font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]">
                  Recipients
                </h3>
                <div className="grid gap-1.5">
                  {context.recipients.map((r) => {
                    const alreadyAwarded = awardedForBadge.has(r.idTag);
                    const checked = selectedRecipients.has(r.idTag) && !alreadyAwarded;
                    return (
                      <label
                        key={r.idTag}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl bg-[var(--bg-card)] px-3 py-2 text-sm",
                          alreadyAwarded && "opacity-60",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={alreadyAwarded}
                          onChange={() => toggleRecipient(r.idTag)}
                          className="h-4 w-4"
                        />
                        <span className="min-w-0 flex-1 truncate font-medium text-[var(--ink-1)]">
                          {r.displayName}
                          {r.hiddenAttribution ? (
                            <span className="ml-1 text-xs font-normal text-[var(--ink-3)]">
                              · hidden publicly
                            </span>
                          ) : null}
                        </span>
                        {alreadyAwarded ? (
                          <span className="shrink-0 text-xs font-semibold text-[var(--ink-3)]">
                            Already awarded
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </section>

              {/* Badge picker (no points shown) */}
              <section className="grid gap-2">
                <h3 className="font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]">
                  Badge
                </h3>
                <div className="flex flex-wrap gap-2">
                  {context.badges.map((b) => (
                    <button
                      key={b.badgeType}
                      type="button"
                      onClick={() => setBadgeType(b.badgeType)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                        badgeType === b.badgeType
                          ? "border-[var(--ink-1)] bg-[var(--ink-1)] text-[var(--ink-on-dark)]"
                          : "border-[var(--meter-track)] bg-[var(--bg-card)] text-[var(--ink-1)]",
                      )}
                    >
                      <span aria-hidden>{b.emoji}</span> {b.name}
                    </button>
                  ))}
                </div>
              </section>

              {/* Note */}
              <section className="grid gap-1">
                <label className="font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]">
                  Note (optional)
                </label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={NOTE_MAX}
                  placeholder="A short note for the recipient…"
                />
              </section>

              {error ? (
                <p className="rounded-md border border-[var(--ink-danger)] bg-[var(--bg-danger)] px-3 py-2 text-sm text-[var(--ink-danger)]" role="alert">
                  {error}
                </p>
              ) : null}
              {feedback ? (
                <p className="text-sm font-semibold text-[var(--teal)]" role="status">
                  {feedback}
                </p>
              ) : null}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isWorking || !badgeType}
                  onClick={handleAward}
                >
                  {isWorking ? "Awarding…" : "Award Badge"}
                </Button>
              </div>
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

import { FormEvent, useEffect, useState } from "react";
import { useMutation } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { HistoryEvent } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetGrabber,
  SheetKicker,
  SheetTitle,
} from "../../components/ui/sheet";
import { useMusicSafe } from "../../providers/MusicProvider";

export interface EditCheckpointSheetProps {
  /** The check-in history event to edit. `null` closes the sheet. */
  event: HistoryEvent | null;
  token: string;
  onClose: () => void;
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("too many") || message.toLowerCase().includes("rate")) {
    return "Too many edits in a short window. Try again in a minute.";
  }
  if (message.toLowerCase().includes("not found")) {
    return "This check-in no longer exists.";
  }
  return message || "Unable to save changes.";
}

/**
 * Edit a previously saved check-in. Reads title / note / locationLabel /
 * showInStory off the history event and patches them via
 * `tripcastApi.checkpoints.updateCheckpoint`. Lat / lon / source stay
 * immutable — the underlying backend mutation rejects those args.
 *
 * The sheet auto-resets its form fields each time `event` changes (open
 * with a different check-in → state seeds from the new row).
 */
export default function EditCheckpointSheet({ event, token, onClose }: EditCheckpointSheetProps) {
  const updateCheckpoint = useMutation(tripcastApi.checkpoints.updateCheckpoint);
  const music = useMusicSafe();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [showInStory, setShowInStory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (event) {
      setTitle(event.title ?? "");
      setNote(event.body ?? "");
      setLocationLabel(event.locationLabel ?? "");
      setShowInStory(event.storyLevel !== "activity");
      setError(null);
      setIsSaving(false);
    }
  }, [event]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!event || !event.checkpointId || isSaving) return;
    setError(null);
    setIsSaving(true);
    try {
      await updateCheckpoint({
        token,
        checkpointId: event.checkpointId,
        title: title.trim() ? title : undefined,
        note: note.trim() ? note : undefined,
        locationLabel: locationLabel.trim() ? locationLabel : undefined,
        showInStory,
      });
      music.sfx("success");
      onClose();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet
      open={event !== null}
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showBackdrop={false}
        className="z-[12] max-h-[85dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
        data-role="edit-checkpoint-sheet"
      >
        <SheetGrabber />
        <div className="flex items-start justify-between gap-2 px-4 pt-2">
          <div className="flex min-w-0 flex-col gap-1">
            <SheetKicker dotColor="var(--amber)">Edit · Check-in</SheetKicker>
            <SheetTitle className="font-[var(--font-display)] text-xl font-extrabold tracking-tight text-[var(--ink-1)]">
              Edit check-in
            </SheetTitle>
          </div>
          <SheetCloseButton aria-label="Close edit form" />
        </div>

        <form
          className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-3"
          onSubmit={handleSubmit}
        >
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
            Title <span className="font-normal text-[var(--ink-3)]">(optional)</span>
            <Input
              autoFocus
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              type="text"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
            Place name <span className="font-normal text-[var(--ink-3)]">(optional)</span>
            <Input
              maxLength={120}
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="e.g. Capitol Hill"
              type="text"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
            Story / Notes
            <Textarea
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--ink-1)]">
            <input
              type="checkbox"
              checked={showInStory}
              onChange={(e) => setShowInStory(e.target.checked)}
              className="h-4 w-4"
              style={{ accentColor: "var(--flag)" }}
            />
            Add to Story
          </label>
          {error ? (
            <p
              role="alert"
              className="rounded-md border px-3 py-2 text-sm"
              style={{
                borderColor: "color-mix(in oklab, var(--danger) 25%, transparent)",
                background: "color-mix(in oklab, var(--danger) 10%, transparent)",
                color: "var(--danger)",
              }}
            >
              {error}
            </p>
          ) : null}
          <div
            className="flex flex-wrap justify-end gap-2 pt-1"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

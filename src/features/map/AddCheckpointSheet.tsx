import { FormEvent, useEffect, useState } from "react";

import type { AddCheckpointArgs, CheckpointSource } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";

export type SelectedCoordinate = {
  lat: number;
  lon: number;
  source: CheckpointSource;
};

type AddCheckpointSheetProps = {
  selectedCoordinate: SelectedCoordinate | null;
  onSave: (args: Omit<AddCheckpointArgs, "token">) => Promise<void>;
  onClose: () => void;
  saveUnavailableMessage?: string;
};

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("too many") || message.toLowerCase().includes("rate")) {
    return "Too many checkpoints added too quickly. Try again in a minute.";
  }
  return message || "Unable to save checkpoint.";
}

export default function AddCheckpointSheet({
  selectedCoordinate,
  onSave,
  onClose,
  saveUnavailableMessage,
}: AddCheckpointSheetProps) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (selectedCoordinate) {
      setTitle("");
      setNote("");
      setError(null);
      setIsSaving(false);
    }
  }, [selectedCoordinate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCoordinate || isSaving) {
      return;
    }

    setError(null);
    if (saveUnavailableMessage) {
      setError(saveUnavailableMessage);
      return;
    }

    setIsSaving(true);

    try {
      await onSave({
        title: title.trim() ? title : undefined,
        note: note.trim() ? note : undefined,
        lat: selectedCoordinate.lat,
        lon: selectedCoordinate.lon,
        source: selectedCoordinate.source,
      });
      onClose();
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet open={selectedCoordinate !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Add Pin</SheetTitle>
        </SheetHeader>
        <form className="flex flex-col gap-4 p-4 pt-0 overflow-y-auto" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Title <span className="font-normal text-muted-foreground">(optional)</span>
            <Input
              autoFocus
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              type="text"
              value={title}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Note
            <Textarea
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              value={note}
            />
          </label>
          <div className="rounded-md bg-muted px-3 py-2 text-sm grid gap-1">
            <span>Lat {formatCoordinate(selectedCoordinate?.lat ?? 0)}</span>
            <span>Lon {formatCoordinate(selectedCoordinate?.lon ?? 0)}</span>
          </div>
          {error ? (
            <p role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2 justify-end" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <Button disabled={isSaving} type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={isSaving} type="submit">
              {isSaving ? "Saving…" : "Save Pin"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

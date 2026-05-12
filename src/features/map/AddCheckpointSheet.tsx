import { FormEvent, useEffect, useState } from "react";

import type { AddCheckpointArgs, CheckpointSource } from "../../convex/tripcastApi";

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

  if (!selectedCoordinate) {
    return null;
  }

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
    <div className="sheet-backdrop" role="presentation">
      <form className="checkpoint-sheet" onSubmit={handleSubmit}>
        <h2>Add Pin</h2>
        <label>
          Title optional
          <input
            autoFocus
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            type="text"
            value={title}
          />
        </label>
        <label>
          Note
          <textarea
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            value={note}
          />
        </label>
        <div className="coordinate-readout">
          <span>Lat {formatCoordinate(selectedCoordinate.lat)}</span>
          <span>Lon {formatCoordinate(selectedCoordinate.lon)}</span>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="sheet-actions">
          <button disabled={isSaving} type="button" onClick={onClose}>
            Cancel
          </button>
          <button disabled={isSaving} type="submit">
            {isSaving ? "Saving..." : "Save Pin"}
          </button>
        </div>
      </form>
    </div>
  );
}

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type SetActivitySheetProps = {
  open: boolean;
  token: string;
  onOpenChange: (open: boolean) => void;
};

// ---------------------------------------------------------------------------
// Quick activity presets
// ---------------------------------------------------------------------------

const QUICK_ACTIVITIES = [
  { label: "Walking", emoji: "🚶" },
  { label: "Eating", emoji: "🍽️" },
  { label: "Taking train", emoji: "🚆" },
  { label: "Resting", emoji: "🪑" },
  { label: "Exploring", emoji: "🧭" },
  { label: "Shopping", emoji: "🛒" },
  { label: "Errands", emoji: "💻" },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function friendlyError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.toLowerCase().includes("too many") || msg.toLowerCase().includes("rate")) {
    return "Too many updates. Try again in a minute.";
  }
  return msg || "Unable to set activity.";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SetActivitySheet({ open, token, onOpenChange }: SetActivitySheetProps) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [note, setNote] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingActivity = useQuery(
    tripcastApi.currentActivity.travelerGetCurrentActivity,
    open ? { token } : "skip",
  );

  const setActivity = useMutation(tripcastApi.currentActivity.travelerSetCurrentActivity);

  // Reset form state when sheet closes
  useEffect(() => {
    if (!open) {
      setTitle("");
      setEmoji("");
      setNote("");
      setLocationLabel("");
      setError(null);
      setIsSaving(false);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || isSaving) return;
    setError(null);
    setIsSaving(true);
    try {
      await setActivity({
        token,
        title: title.trim(),
        emoji: emoji || undefined,
        note: note || undefined,
        locationLabel: locationLabel || undefined,
      });
      onOpenChange(false);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Set Current Activity</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-3 p-4 pt-0 overflow-y-auto">
          {existingActivity && (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Replaces current: <span className="font-medium">{existingActivity.title}</span>
            </div>
          )}

          {/* Quick activity buttons */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {QUICK_ACTIVITIES.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => { setTitle(a.label); setEmoji(a.emoji); }}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  title === a.label ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {a.emoji} {a.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="Emoji"
                className="w-20 text-center"
                maxLength={10}
              />
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What are you doing? *"
                className="flex-1"
                required
              />
            </div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              className="resize-none"
              rows={2}
              maxLength={500}
            />
            <Input
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="Place name (optional)"
            />

            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

            <Button type="submit" disabled={!title.trim() || isSaving} className="w-full">
              {isSaving ? "Saving…" : existingActivity ? "Replace Activity" : "Set Activity"}
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

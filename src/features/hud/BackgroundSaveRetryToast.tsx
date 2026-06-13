import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useBackgroundSave } from "../../providers/BackgroundSaveProvider";
import { PendingSave } from "../../lib/idb";
import { AlertCircle, RotateCcw, X } from "lucide-react";
import { Button } from "../../components/ui/button";

export function BackgroundSaveRetryToast({ onRetry }: { onRetry: (save: PendingSave) => void }) {
  const { saves, dismissSave, retrySave } = useBackgroundSave();

  const failedSaves = saves.filter(s => s.status === "failed" || s.status === "link-failed");

  if (failedSaves.length === 0) return null;

  const currentSave = failedSaves[failedSaves.length - 1];

  return (
    <motion.div
      key={currentSave.id}
      data-bg-retry-toast
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      className="pointer-events-auto flex items-center gap-3 rounded-lg bg-[var(--bg-danger)] px-4 py-3 shadow-lg border border-[var(--ink-danger)] max-w-sm"
    >
      <AlertCircle className="h-5 w-5 text-[var(--ink-danger)] shrink-0" />

      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-bold text-[var(--ink-danger)]">
          {currentSave.status === "link-failed" ? "Spend Tracking Failed" : "Save Failed"}
        </span>
        <span className="text-xs text-[var(--ink-danger)] opacity-90 truncate">
          {currentSave.status === "link-failed"
            ? "Pin saved, but spend tracking failed — tap Retry to relink."
            : (currentSave.error || "Unable to save pin.")}
        </span>
      </div>

      <div className="flex items-center gap-2 ml-auto shrink-0">
        <RetryButton
          save={currentSave}
          onRetry={onRetry}
          retrySave={retrySave}
        />
        <button
          onClick={() => dismissSave(currentSave.id)}
          className="p-1 text-[var(--ink-danger)] hover:bg-black/5 rounded-full"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}

function RetryButton({
  save,
  onRetry,
  retrySave,
}: {
  save: PendingSave;
  onRetry: (save: PendingSave) => void;
  retrySave: (id: string) => Promise<void>;
}) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    save.nextRetryAt ? Math.max(0, Math.ceil((save.nextRetryAt - Date.now()) / 1000)) : 0,
  );

  useEffect(() => {
    if (!save.nextRetryAt) { setSecondsLeft(0); return; }
    const tick = () => {
      const left = Math.max(0, Math.ceil((save.nextRetryAt! - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [save.nextRetryAt]);

  function handleClick() {
    if (save.status === "link-failed") {
      retrySave(save.id);
    } else {
      onRetry(save);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={secondsLeft > 0}
      className="h-8 border-[var(--ink-danger)] text-[var(--ink-danger)] hover:bg-[var(--ink-danger)] hover:text-white disabled:opacity-50"
      onClick={handleClick}
    >
      {secondsLeft > 0 ? (
        `Retry in ${secondsLeft}s`
      ) : (
        <>
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Retry
        </>
      )}
    </Button>
  );
}

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBackgroundSave } from "../../providers/BackgroundSaveProvider";
import { AlertCircle, RotateCcw, X } from "lucide-react";
import { Button } from "../../components/ui/button";

export function BackgroundSaveRetryToast({ onRetry }: { onRetry: (save: any) => void }) {
  const { saves, dismissSave } = useBackgroundSave();

  const failedSaves = saves.filter(s => s.status === "failed");

  if (failedSaves.length === 0) return null;

  // Show the most recent failed save
  const currentSave = failedSaves[failedSaves.length - 1];

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      className="pointer-events-auto flex items-center gap-3 rounded-lg bg-[var(--bg-danger)] px-4 py-3 shadow-lg border border-[var(--ink-danger)] max-w-sm"
    >
      <AlertCircle className="h-5 w-5 text-[var(--ink-danger)] shrink-0" />

      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-bold text-[var(--ink-danger)]">
          Save Failed
        </span>
        <span className="text-xs text-[var(--ink-danger)] opacity-90 truncate">
          {currentSave.error || "Unable to save pin."}
        </span>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <Button
          size="sm"
          variant="outline"
          className="h-8 border-[var(--ink-danger)] text-[var(--ink-danger)] hover:bg-[var(--ink-danger)] hover:text-white"
          onClick={() => onRetry(currentSave)}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Retry
        </Button>
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

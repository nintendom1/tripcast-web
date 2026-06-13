import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBackgroundSave } from "../../providers/BackgroundSaveProvider";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "../../lib/utils";

export function BackgroundUploadBar() {
  const { saves } = useBackgroundSave();

  // Only show for uploading/saving states. Failed states are handled by the retry toast.
  const activeSaves = saves.filter(s => s.status === "uploading" || s.status === "saving");

  if (activeSaves.length === 0) return null;

  // Show the most recent active save
  const currentSave = activeSaves[activeSaves.length - 1];

  return (
    <motion.div
      data-bg-upload-bar
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      className="pointer-events-auto flex items-center gap-3 rounded-full bg-[var(--bg-card)]/90 px-4 py-2 shadow-[var(--shadow-card)] backdrop-blur-md border border-[var(--line-soft)]"
    >
      {currentSave.status === "uploading" ? (
        <Loader2 className="h-4 w-4 animate-spin text-[var(--flag)]" />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-[var(--flag)]" />
      )}

      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-2)]">
          {currentSave.status === "uploading" ? "Uploading Photo..." : "Saving Pin..."}
        </span>
        <div className="h-1 w-32 overflow-hidden rounded-full bg-[var(--meter-track)]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${currentSave.progress}%` }}
            className="h-full bg-[var(--flag)]"
          />
        </div>
      </div>

      {activeSaves.length > 1 && (
        <span className="text-[10px] font-bold text-[var(--ink-3)]">
          +{activeSaves.length - 1} more
        </span>
      )}
    </motion.div>
  );
}

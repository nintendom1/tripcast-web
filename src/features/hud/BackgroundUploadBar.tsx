import React from "react";
import { motion } from "framer-motion";
import { useBackgroundSave } from "../../providers/BackgroundSaveProvider";
import { Loader2, CheckCircle2 } from "lucide-react";
import { PendingSave } from "../../lib/idb";

export interface BackgroundUploadBarViewProps {
  currentSave: PendingSave | null;
  extraCount?: number;
}

export function BackgroundUploadBarView({ currentSave, extraCount = 0 }: BackgroundUploadBarViewProps) {
  if (!currentSave) return null;

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
            data-bg-upload-bar-fill
            initial={{ width: 0 }}
            animate={{ width: `${currentSave.progress}%` }}
            className="h-full bg-[var(--flag)]"
          />
        </div>
      </div>

      {extraCount > 0 && (
        <span className="text-[10px] font-bold text-[var(--ink-3)]">
          +{extraCount} more
        </span>
      )}
    </motion.div>
  );
}

export function BackgroundUploadBar() {
  const { saves } = useBackgroundSave();
  const activeSaves = saves.filter(s => s.status === "uploading" || s.status === "saving");
  const currentSave = activeSaves[activeSaves.length - 1] ?? null;
  const extraCount = Math.max(0, activeSaves.length - 1);

  return <BackgroundUploadBarView currentSave={currentSave} extraCount={extraCount} />;
}

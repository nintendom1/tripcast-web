import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { isUnplacedSave, useBackgroundSave, type BackgroundSaveNotice } from "../../providers/BackgroundSaveProvider";
import { useOptionalTripContext } from "../../providers/TripContextProvider";
import { PendingSave } from "../../lib/idb";
import { AlertCircle, RotateCcw, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useOffScreenSaveTrip } from "./BackgroundUploadBar";

export interface BackgroundSaveRetryToastViewProps {
  save: PendingSave | null;
  onRetry: (save: PendingSave) => void;
  onDismiss: (id: string) => void;
  onRetryLinkFailed: (id: string) => Promise<void> | void;
  /** The save's trip when it is not the trip on screen. */
  tripTitle?: string | null;
  /**
   * Set for a save that couldn't be placed on any trip: the only way to send it is this explicit choice, a
   * "Save to <title>" button (the trip on screen), instead of Retry.
   */
  chooseTripTitle?: string | null;
  onChooseTrip?: (id: string) => void;
  /** Saves removed because their trip was deleted; each stays until dismissed. */
  notices?: BackgroundSaveNotice[];
  onDismissNotice?: (id: string) => void;
}

export function BackgroundSaveRetryToastView({
  save,
  onRetry,
  onDismiss,
  onRetryLinkFailed,
  tripTitle = null,
  chooseTripTitle = null,
  onChooseTrip,
  notices = [],
  onDismissNotice,
}: BackgroundSaveRetryToastViewProps) {
  if (!save && notices.length === 0) return null;

  return (
    <>
      {notices.map((notice) => (
        <div
          key={notice.id}
          role="status"
          data-bg-save-notice
          className="pointer-events-auto flex items-center gap-3 rounded-lg bg-[var(--bg-card)] px-4 py-3 shadow-lg border border-[var(--line-soft)] max-w-sm"
        >
          <AlertCircle className="h-5 w-5 text-[var(--ink-3)] shrink-0" />
          <span className="text-xs text-[var(--ink-2)]">{notice.message}</span>
          <button
            onClick={() => onDismissNotice?.(notice.id)}
            className="ml-auto p-1 text-[var(--ink-3)] hover:bg-black/5 rounded-full shrink-0"
            aria-label="Dismiss notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {save ? (
        <motion.div
          key={save.id}
          data-bg-retry-toast
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          className="pointer-events-auto flex items-center gap-3 rounded-lg bg-[var(--bg-danger)] px-4 py-3 shadow-lg border border-[var(--ink-danger)] max-w-sm"
        >
          <AlertCircle className="h-5 w-5 text-[var(--ink-danger)] shrink-0" />

          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-bold text-[var(--ink-danger)]">
              {save.status === "link-failed" ? "Spend Tracking Failed" : "Save Failed"}
            </span>
            {tripTitle ? (
              <span data-testid="bg-save-trip" className="text-xs font-semibold text-[var(--ink-danger)] truncate">
                {tripTitle}
              </span>
            ) : null}
            <span className="text-xs text-[var(--ink-danger)] opacity-90 truncate">
              {save.status === "link-failed"
                ? "Pin saved, but spend tracking failed — tap Retry to relink."
                : (save.error || "Unable to save pin.")}
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto shrink-0">
            {chooseTripTitle && onChooseTrip ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-[var(--ink-danger)] text-[var(--ink-danger)] hover:bg-[var(--ink-danger)] hover:text-white"
                onClick={() => onChooseTrip(save.id)}
              >
                Save to {chooseTripTitle}
              </Button>
            ) : (
              <RetryButton
                save={save}
                onRetry={onRetry}
                onRetryLinkFailed={onRetryLinkFailed}
              />
            )}
            <button
              onClick={() => onDismiss(save.id)}
              className="p-1 text-[var(--ink-danger)] hover:bg-black/5 rounded-full"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      ) : null}
    </>
  );
}

export function BackgroundSaveRetryToast({ onRetry }: { onRetry: (save: PendingSave) => void }) {
  const { saves, dismissSave, retrySave, notices, dismissNotice } = useBackgroundSave();
  const { role, multiTripEnabled, viewingTrip } = useOptionalTripContext();
  const failedSaves = saves.filter(s => s.status === "failed" || s.status === "link-failed");
  const currentSave = failedSaves[failedSaves.length - 1] ?? null;
  const tripTitle = useOffScreenSaveTrip(currentSave);
  // A save that couldn't be placed is never re-sent to the trip on screen on its own: the Traveler picks that trip by
  // name. Multi-trip Travelers only (such a save exists only for them).
  const chooseTrip =
    role === "traveler" && multiTripEnabled && viewingTrip && currentSave && isUnplacedSave(currentSave) ? viewingTrip : null;

  return (
    <BackgroundSaveRetryToastView
      save={currentSave}
      onRetry={onRetry}
      onDismiss={dismissSave}
      onRetryLinkFailed={retrySave}
      tripTitle={tripTitle}
      chooseTripTitle={chooseTrip?.title ?? null}
      onChooseTrip={chooseTrip ? (id) => void retrySave(id, chooseTrip) : undefined}
      // Older test doubles of the provider have no notices.
      notices={notices ?? []}
      onDismissNotice={dismissNotice}
    />
  );
}

function RetryButton({
  save,
  onRetry,
  onRetryLinkFailed,
}: {
  save: PendingSave;
  onRetry: (save: PendingSave) => void;
  onRetryLinkFailed: (id: string) => Promise<void> | void;
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
      onRetryLinkFailed(save.id);
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

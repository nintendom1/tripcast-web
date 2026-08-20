import { motion } from "framer-motion";
import { X } from "lucide-react";

import {
  useNativeMotionState,
  type NativeMotionClassification,
  type NativeMotionState,
} from "../../native/nativeMotionState";
import { formatRelativeTime } from "./travelerStateUtils";

const PANEL_MOTION = {
  initial: { y: "100%" },
  animate: { y: 0 },
  exit: { y: "100%" },
  transition: { duration: 0.34, ease: [0.22, 0.9, 0.3, 1.05] as const },
};

const CLASSIFICATION_LABELS: Record<NativeMotionClassification, string> = {
  unknown: "Unknown",
  stationary: "Stationary",
  walking: "Walking",
  running: "Running",
  cycling: "Cycling",
  automotive: "Vehicle",
};

export interface MotionDiagnosticsModalProps {
  onClose: () => void;
  previewState?: NativeMotionState;
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">{label}</span>
      <span className="text-right text-sm text-[var(--ink-1)]">{value}</span>
    </div>
  );
}

export default function MotionDiagnosticsModal({
  onClose,
  previewState,
}: MotionDiagnosticsModalProps) {
  const liveState = useNativeMotionState();
  const state = previewState ?? liveState;
  const pendingLabel = state.pendingClassification
    ? CLASSIFICATION_LABELS[state.pendingClassification]
    : "None";

  return (
    <motion.div
      {...PANEL_MOTION}
      data-role="motion-diagnostics-modal"
      className="absolute inset-x-0 bottom-0 z-[20] flex max-h-[85dvh] flex-col rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-none items-center justify-between border-b border-[var(--line-soft)] px-4 py-3">
        <h2 className="font-[var(--font-display)] text-lg font-extrabold tracking-tight text-[var(--ink-1)]">
          Motion Diagnostics
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Motion Diagnostics"
          className="rounded-full p-1.5 text-[var(--ink-3)] hover:bg-[var(--bg-card)] hover:text-[var(--ink-1)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 overflow-y-auto p-4">
        <p className="text-xs text-[var(--ink-3)]">
          iOS classifications update while Live is on. Only medium/high-confidence Walking,
          Running, Cycling, and Vehicle states can change your activity.
        </p>
        <DiagnosticRow label="Classification" value={CLASSIFICATION_LABELS[state.classification]} />
        <DiagnosticRow label="Confidence" value={state.confidence} />
        <DiagnosticRow
          label="Classified"
          value={state.changedAt === null ? "Not yet" : formatRelativeTime(state.changedAt)}
        />
        <DiagnosticRow label="Publish status" value={state.publishStatus} />
        <DiagnosticRow label="Pending" value={pendingLabel} />
        {state.publishFailureReason && (
          <DiagnosticRow label="Failure" value={state.publishFailureReason} />
        )}
      </div>
    </motion.div>
  );
}

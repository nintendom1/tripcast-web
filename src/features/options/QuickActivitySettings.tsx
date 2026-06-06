import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useMutation, useQuery } from "convex/react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2, X } from "lucide-react";

import { Button } from "../../components/ui/button";
import { tripcastApi } from "../../convex/tripcastApi";
import type { QuickActivity, QuickActivitySettings } from "../../convex/tripcastApi";

const MAX_QUICK_ACTIVITIES = 10;
const MAX_LABEL_LENGTH = 80;
const MAX_EMOJI_LENGTH = 10;
const LOCAL_STORAGE_KEY = "tripcast.quick_activities_settings";

const DEFAULT_ACTIVITIES: QuickActivity[] = [
  { label: "Walking", emoji: "🚶" },
  { label: "Eating", emoji: "🍽️" },
  { label: "Taking train", emoji: "🚆" },
  { label: "Resting", emoji: "🪑" },
  { label: "Exploring", emoji: "🧭" },
  { label: "Shopping", emoji: "🛒" },
  { label: "Errands", emoji: "💻" },
  { label: "Sleeping", emoji: "🛏️" },
];

type LocalQuickActivitySettings = Pick<QuickActivitySettings, "activities" | "displayCount">;
type DraftActivity = QuickActivity & { id: string };
type StatusMessage = { kind: "error" | "success"; text: string } | null;

let draftIdCounter = 0;

function nextDraftId() {
  draftIdCounter += 1;
  return `quick-activity-${draftIdCounter}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function defaultSettings(): LocalQuickActivitySettings {
  return {
    activities: DEFAULT_ACTIVITIES.map((activity) => ({ ...activity })),
    displayCount: Math.min(8, DEFAULT_ACTIVITIES.length),
  };
}

function normalizeActivities(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((activity) => {
      if (!activity || typeof activity !== "object") return null;
      const raw = activity as Partial<QuickActivity>;
      if (typeof raw.label !== "string" || typeof raw.emoji !== "string") return null;
      const label = raw.label.trim().slice(0, MAX_LABEL_LENGTH);
      if (!label) return null;
      return {
        label,
        emoji: raw.emoji.trim().slice(0, MAX_EMOJI_LENGTH),
      };
    })
    .filter((activity): activity is QuickActivity => activity !== null)
    .slice(0, MAX_QUICK_ACTIVITIES);
}

function normalizeSettings(value: unknown): LocalQuickActivitySettings {
  if (!value || typeof value !== "object") return defaultSettings();
  const candidate = value as Partial<LocalQuickActivitySettings>;
  const activities = normalizeActivities(candidate.activities);
  const safeActivities = activities.length > 0 ? activities : defaultSettings().activities;
  const rawDisplayCount =
    typeof candidate.displayCount === "number" && Number.isFinite(candidate.displayCount)
      ? Math.trunc(candidate.displayCount)
      : Math.min(8, safeActivities.length);

  return {
    activities: safeActivities,
    displayCount: clamp(rawDisplayCount, 1, safeActivities.length),
  };
}

function draftActivitiesFrom(settings: LocalQuickActivitySettings): DraftActivity[] {
  return settings.activities.map((activity) => ({
    ...activity,
    id: nextDraftId(),
  }));
}

function settingsFromDraft(
  activities: DraftActivity[],
  displayCount: number,
): LocalQuickActivitySettings | null {
  const normalizedActivities = normalizeActivities(activities);
  if (normalizedActivities.length === 0) return null;
  return {
    activities: normalizedActivities,
    displayCount: clamp(displayCount, 1, normalizedActivities.length),
  };
}

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function dispatchQuickActivityUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("tripcast.quick_activities_updated"));
  }
}

export function getQuickActivitySettings(): LocalQuickActivitySettings {
  const storage = getStorage();
  if (!storage) return defaultSettings();

  try {
    const saved = storage.getItem(LOCAL_STORAGE_KEY);
    return saved ? normalizeSettings(JSON.parse(saved)) : defaultSettings();
  } catch (error) {
    console.error("Failed to load quick activities from localStorage", error);
    return defaultSettings();
  }
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function DiffModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  confirmLabel,
  localActivities,
  localDisplayCount,
  remoteActivities,
  remoteDisplayCount,
  busy,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  confirmLabel: string;
  localActivities: QuickActivity[];
  localDisplayCount: number;
  remoteActivities: QuickActivity[];
  remoteDisplayCount: number;
  busy?: boolean;
}) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm transition-all" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[120] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-[var(--bg-paper)] p-6 shadow-2xl outline-none transition-all focus-visible:ring-2 focus-visible:ring-[var(--flag)]">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="font-[var(--font-display)] text-xl font-bold text-[var(--ink-1)]">
              {title}
            </Dialog.Title>
            <Dialog.Close className="rounded-full p-1 text-[var(--ink-3)] hover:bg-[var(--bg-card)]">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="mb-6 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <SettingsPreview
                title="Current Local"
                activities={localActivities}
                displayCount={localDisplayCount}
              />
              <SettingsPreview
                title="Remote"
                activities={remoteActivities}
                displayCount={remoteDisplayCount}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={busy}>
              {busy ? "Saving..." : confirmLabel}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SettingsPreview({
  title,
  activities,
  displayCount,
}: {
  title: string;
  activities: QuickActivity[];
  displayCount: number;
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--ink-3)]">{title}</h4>
      <div className="space-y-1.5">
        <div className="rounded bg-[var(--meter-track)] px-2 py-1 text-xs font-medium text-[var(--ink-2)]">
          Display count: {displayCount}
        </div>
        {activities.map((activity, index) => (
          <div
            key={`${activity.label}-${index}`}
            className="flex items-center gap-2 rounded border border-[var(--line-soft)] bg-[var(--bg-card)] p-2 text-sm"
          >
            <span className="text-base">{activity.emoji}</span>
            <span className="truncate font-medium text-[var(--ink-1)]">{activity.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function QuickActivitySettingsView({ token }: { token: string }) {
  const [draft, setDraft] = useState(() => {
    const initialSettings = getQuickActivitySettings();
    return {
      activities: draftActivitiesFrom(initialSettings),
      displayCount: initialSettings.displayCount,
    };
  });
  const [isPullModalOpen, setIsPullModalOpen] = useState(false);
  const [isPushModalOpen, setIsPushModalOpen] = useState(false);
  const [remoteSettings, setRemoteSettings] = useState<QuickActivitySettings | null>(null);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [saving, setSaving] = useState(false);

  const updateMutation = useMutation(tripcastApi.currentActivity.travelerUpdateQuickActivitySettings);
  const remoteQueryData = useQuery(tripcastApi.currentActivity.travelerGetQuickActivitySettings, { token });
  const { activities, displayCount } = draft;

  const saveToLocal = (nextDraftActivities: DraftActivity[], nextDisplayCount: number) => {
    const next = settingsFromDraft(nextDraftActivities, nextDisplayCount);
    if (!next) {
      setStatus({ kind: "error", text: "At least one quick activity needs a label." });
      return false;
    }

    const storage = getStorage();
    if (!storage) {
      setStatus({ kind: "error", text: "Local storage is unavailable in this browser." });
      return false;
    }

    try {
      storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
      dispatchQuickActivityUpdate();
      setStatus(null);
      return true;
    } catch (error) {
      setStatus({ kind: "error", text: `Could not save locally. ${formatError(error)}` });
      return false;
    }
  };

  const commitDraft = (nextDraftActivities: DraftActivity[], rawDisplayCount: number) => {
    const nextDisplayCount = clamp(rawDisplayCount, 1, nextDraftActivities.length);
    setDraft({ activities: nextDraftActivities, displayCount: nextDisplayCount });
    return saveToLocal(nextDraftActivities, nextDisplayCount);
  };

  const handleAdd = () => {
    if (activities.length >= MAX_QUICK_ACTIVITIES) return;
    commitDraft(
      [...activities, { id: nextDraftId(), label: "New Activity", emoji: "?" }],
      displayCount,
    );
  };

  const handleRemove = (id: string) => {
    if (activities.length <= 1) return;
    const next = activities.filter((activity) => activity.id !== id);
    commitDraft(next, Math.min(displayCount, next.length));
  };

  const handleUpdate = (id: string, patch: Partial<QuickActivity>) => {
    const next = activities.map((activity) =>
      activity.id === id ? { ...activity, ...patch } : activity,
    );
    commitDraft(next, displayCount);
  };

  const handleDisplayCountChange = (value: number) => {
    commitDraft(activities, value);
  };

  const handleResetDefaults = () => {
    const defaults = defaultSettings();
    if (commitDraft(draftActivitiesFrom(defaults), defaults.displayCount)) {
      setStatus({ kind: "success", text: "Quick activities reset to defaults locally." });
    }
  };

  const openPull = () => {
    if (!remoteQueryData) {
      setStatus({ kind: "error", text: "Remote settings are still loading." });
      return;
    }
    setRemoteSettings(remoteQueryData);
    setIsPullModalOpen(true);
  };

  const openPush = () => {
    if (!remoteQueryData) {
      setStatus({ kind: "error", text: "Remote settings are still loading." });
      return;
    }
    setRemoteSettings(remoteQueryData);
    setIsPushModalOpen(true);
  };

  const confirmPull = () => {
    if (!remoteSettings) return;
    const pulled = normalizeSettings(remoteSettings);
    if (commitDraft(draftActivitiesFrom(pulled), pulled.displayCount)) {
      setStatus({ kind: "success", text: "Remote quick activities applied locally." });
    }
    setIsPullModalOpen(false);
  };

  const confirmPush = async () => {
    const next = settingsFromDraft(activities, displayCount);
    if (!next) {
      setStatus({ kind: "error", text: "At least one quick activity needs a label." });
      return;
    }
    if (activities.some((activity) => !activity.label.trim())) {
      setStatus({ kind: "error", text: "Fill in every activity label before pushing." });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      await updateMutation({ token, activities: next.activities, displayCount: next.displayCount });
      setDraft({ activities: draftActivitiesFrom(next), displayCount: next.displayCount });
      setIsPushModalOpen(false);
      setStatus({ kind: "success", text: "Backend quick activities updated." });
    } catch (error) {
      setStatus({ kind: "error", text: `Could not push settings. ${formatError(error)}` });
    } finally {
      setSaving(false);
    }
  };

  const localPreview = settingsFromDraft(activities, displayCount) ?? defaultSettings();
  const modalRemote = remoteSettings ?? remoteQueryData ?? {
    ...defaultSettings(),
    updatedAt: null,
    updatedBySessionId: null,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-[var(--font-mono)] text-[11px] font-semibold uppercase text-[var(--ink-3)]">
          Quick Activities
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetDefaults}
            className="h-8 gap-1.5 text-xs font-bold uppercase tracking-tight"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openPull}
            className="h-8 gap-1.5 text-xs font-bold uppercase tracking-tight"
            disabled={!remoteQueryData}
          >
            <ArrowDown className="h-3 w-3" /> Pull
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openPush}
            className="h-8 gap-1.5 text-xs font-bold uppercase tracking-tight"
            disabled={!remoteQueryData}
          >
            <ArrowUp className="h-3 w-3" /> Push
          </Button>
        </div>
      </div>

      {status ? (
        <p
          role={status.kind === "error" ? "alert" : "status"}
          className={`rounded-md border px-3 py-2 text-sm ${
            status.kind === "error"
              ? "border-[var(--ink-danger)] bg-[var(--bg-danger)] text-[var(--ink-danger)]"
              : "border-[var(--line-soft)] bg-[var(--meter-track)] text-[var(--teal)]"
          }`}
        >
          {status.text}
        </p>
      ) : null}

      <div className="space-y-4 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-[var(--ink-1)]" htmlFor="quick-activity-display-count">
            Display Count
          </label>
          <span className="rounded-md border border-[var(--line-soft)] bg-[var(--bg-paper)] px-2 py-0.5 font-[var(--font-mono)] text-xs font-bold text-[var(--ink-2)]">
            {displayCount}
          </span>
        </div>
        <input
          id="quick-activity-display-count"
          type="range"
          min={1}
          max={activities.length}
          value={displayCount}
          onChange={(event) => handleDisplayCountChange(Number(event.target.value))}
          className="h-6 w-full accent-[var(--flag)]"
        />
      </div>

      <div className="space-y-2">
        {activities.map((activity, index) => (
          <div
            key={activity.id}
            className="flex items-center gap-2 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] p-2 shadow-sm"
          >
            <input
              type="text"
              value={activity.emoji}
              onChange={(event) =>
                handleUpdate(activity.id, { emoji: event.target.value.slice(0, MAX_EMOJI_LENGTH) })
              }
              className="h-10 w-10 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] text-center text-lg"
              placeholder="🚶"
              maxLength={MAX_EMOJI_LENGTH}
              aria-label={`Quick activity ${index + 1} emoji`}
            />
            <input
              type="text"
              value={activity.label}
              onChange={(event) =>
                handleUpdate(activity.id, { label: event.target.value.slice(0, MAX_LABEL_LENGTH) })
              }
              className="h-10 min-w-0 flex-1 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 text-sm font-medium text-[var(--ink-1)] focus:border-[var(--flag)] focus:outline-none"
              placeholder="Activity label"
              maxLength={MAX_LABEL_LENGTH}
              aria-label={`Quick activity ${index + 1} label`}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleRemove(activity.id)}
              className="h-10 w-10 text-[var(--ink-3)] transition-colors hover:bg-[var(--bg-danger)] hover:text-[var(--ink-danger)]"
              disabled={activities.length <= 1}
              aria-label={`Remove quick activity ${index + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {activities.length < MAX_QUICK_ACTIVITIES ? (
          <Button
            variant="outline"
            className="h-11 w-full border-2 border-dashed text-[var(--ink-2)] hover:bg-[var(--bg-card)]"
            onClick={handleAdd}
          >
            <Plus className="mr-2 h-4 w-4" /> Add Activity
          </Button>
        ) : null}
      </div>

      <DiffModal
        isOpen={isPullModalOpen}
        onClose={() => setIsPullModalOpen(false)}
        onConfirm={confirmPull}
        title="Pull from Backend"
        confirmLabel="Apply Remote Settings"
        localActivities={localPreview.activities}
        localDisplayCount={localPreview.displayCount}
        remoteActivities={modalRemote.activities}
        remoteDisplayCount={modalRemote.displayCount}
      />

      <DiffModal
        isOpen={isPushModalOpen}
        onClose={() => setIsPushModalOpen(false)}
        onConfirm={() => { void confirmPush(); }}
        title="Push to Backend"
        confirmLabel="Overwrite Backend"
        localActivities={localPreview.activities}
        localDisplayCount={localPreview.displayCount}
        remoteActivities={modalRemote.activities}
        remoteDisplayCount={modalRemote.displayCount}
        busy={saving}
      />
    </div>
  );
}

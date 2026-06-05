import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2, ArrowDown, ArrowUp, X } from "lucide-react";
import { tripcastApi } from "../../convex/tripcastApi";
import type { QuickActivity, QuickActivitySettings } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Dialog } from "@base-ui/react/dialog";

const DEFAULT_ACTIVITIES: QuickActivity[] = [
  { label: "Walking", emoji: "🚶" },
  { label: "Eating", emoji: "🍽️" },
  { label: "Taking train", emoji: "🚆" },
  { label: "Resting", emoji: "🪑" },
  { label: "Exploring", emoji: "🧭" },
  { label: "Shopping", emoji: "🛒" },
  { label: "Errands", emoji: "💻" },
  { label: "Sleeping", emoji: "️🛏️" },
];

const LOCAL_STORAGE_KEY = "tripcast.quick_activities_settings";

export function getQuickActivitySettings() {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        activities: parsed.activities || DEFAULT_ACTIVITIES,
        displayCount: parsed.displayCount || 8,
      };
    }
  } catch (e) {
    console.error("Failed to load quick activities from localStorage", e);
  }
  return { activities: DEFAULT_ACTIVITIES, displayCount: 8 };
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
}) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm transition-all" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[120] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--bg-paper)] p-6 shadow-2xl outline-none transition-all focus-visible:ring-2 focus-visible:ring-[var(--flag)]">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="font-[var(--font-display)] text-xl font-bold text-[var(--ink-1)]">
              {title}
            </Dialog.Title>
            <Dialog.Close className="rounded-full p-1 text-[var(--ink-3)] hover:bg-[var(--bg-card)]">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="max-h-[60vh] overflow-y-auto mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <h4 className="text-xs font-bold mb-2 uppercase tracking-wider text-[var(--ink-3)]">Current Local</h4>
                <div className="space-y-1.5">
                  <div className="px-2 py-1 rounded bg-[var(--meter-track)] text-xs font-medium text-[var(--ink-2)]">
                    Display count: {localDisplayCount}
                  </div>
                  {localActivities.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm p-2 rounded border border-[var(--line-soft)] bg-[var(--bg-card)]">
                      <span className="text-base">{a.emoji}</span>
                      <span className="truncate font-medium text-[var(--ink-1)]">{a.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold mb-2 uppercase tracking-wider text-[var(--ink-3)]">Incoming / Remote</h4>
                <div className="space-y-1.5">
                  <div className="px-2 py-1 rounded bg-[var(--meter-track)] text-xs font-medium text-[var(--ink-2)]">
                    Display count: {remoteDisplayCount}
                  </div>
                  {remoteActivities.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm p-2 rounded border border-[var(--line-soft)] bg-[var(--bg-card)]">
                      <span className="text-base">{a.emoji}</span>
                      <span className="truncate font-medium text-[var(--ink-1)]">{a.label}</span>
                    </div>
                  ))}
                  {remoteActivities.length === 0 && (
                    <div className="p-4 text-center text-xs text-[var(--ink-3)] italic">
                      No remote settings found.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function QuickActivitySettingsView({ token }: { token: string }) {
  const [activities, setActivities] = useState<QuickActivity[]>([]);
  const [displayCount, setDisplayCount] = useState(8);
  const [isPullModalOpen, setIsPullModalOpen] = useState(false);
  const [isPushModalOpen, setIsPushModalOpen] = useState(false);
  const [remoteSettings, setRemoteSettings] = useState<QuickActivitySettings | null>(null);

  const updateMutation = useMutation(tripcastApi.currentActivity.travelerUpdateQuickActivitySettings);
  const remoteQueryData = useQuery(tripcastApi.currentActivity.travelerGetQuickActivitySettings, { token });

  useEffect(() => {
    const settings = getQuickActivitySettings();
    setActivities(settings.activities);
    setDisplayCount(settings.displayCount);
  }, []);

  const saveToLocal = (newActivities: QuickActivity[], newCount: number) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ activities: newActivities, displayCount: newCount }));
    window.dispatchEvent(new Event("tripcast.quick_activities_updated"));
  };

  const handleAdd = () => {
    if (activities.length >= 10) return;
    const next = [...activities, { label: "New Activity", emoji: "❓" }];
    setActivities(next);
    const nextCount = displayCount;
    saveToLocal(next, nextCount);
  };

  const handleRemove = (index: number) => {
    const next = activities.filter((_, i) => i !== index);
    setActivities(next);
    const nextCount = Math.min(displayCount, next.length);
    setDisplayCount(nextCount);
    saveToLocal(next, nextCount);
  };

  const handleUpdate = (index: number, patch: Partial<QuickActivity>) => {
    const next = activities.map((a, i) => i === index ? { ...a, ...patch } : a);
    setActivities(next);
    saveToLocal(next, displayCount);
  };

  const handleDisplayCountChange = (val: number) => {
    setDisplayCount(val);
    saveToLocal(activities, val);
  };

  const onPullClick = () => {
    if (remoteQueryData) {
      setRemoteSettings(remoteQueryData);
      setIsPullModalOpen(true);
    } else {
      alert("Remote settings not loaded yet. Please wait a moment.");
    }
  };

  const onPushClick = () => {
    if (remoteQueryData) {
      setRemoteSettings(remoteQueryData);
    }
    setIsPushModalOpen(true);
  };

  const confirmPull = () => {
    if (remoteSettings) {
      setActivities(remoteSettings.activities);
      setDisplayCount(remoteSettings.displayCount);
      saveToLocal(remoteSettings.activities, remoteSettings.displayCount);
    }
    setIsPullModalOpen(false);
  };

  const confirmPush = async () => {
    try {
      await updateMutation({ token, activities, displayCount });
      setIsPushModalOpen(false);
    } catch (e) {
      alert("Failed to push settings: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-[var(--font-mono)] text-[11px] font-semibold uppercase text-[var(--ink-3)]">
          Quick Activities
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onPullClick} className="h-8 gap-1.5 text-xs font-bold uppercase tracking-tight">
            <ArrowDown className="h-3 w-3" /> Pull
          </Button>
          <Button variant="outline" size="sm" onClick={onPushClick} className="h-8 gap-1.5 text-xs font-bold uppercase tracking-tight">
            <ArrowUp className="h-3 w-3" /> Push
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-4 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-[var(--ink-1)]">
            Display Count
          </label>
          <span className="rounded-md border border-[var(--line-soft)] bg-[var(--bg-paper)] px-2 py-0.5 font-[var(--font-mono)] text-xs font-bold text-[var(--ink-2)]">
            {displayCount}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={Math.max(1, activities.length)}
          value={displayCount}
          onChange={(e) => handleDisplayCountChange(Number(e.target.value))}
          className="w-full accent-[var(--flag)] h-6"
        />
        <p className="text-xs text-[var(--ink-3)] leading-relaxed">
          How many activities to show in the Status panel. You can define up to 10 activities below.
        </p>
      </div>

      <div className="space-y-2">
        {activities.map((activity, index) => (
          <div key={index} className="flex gap-2 items-center rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] p-2 shadow-sm">
            <input
              type="text"
              value={activity.emoji}
              onChange={(e) => handleUpdate(index, { emoji: e.target.value.slice(0, 10) })}
              className="w-10 h-10 text-center rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] text-lg"
              placeholder="🚶"
            />
            <input
              type="text"
              value={activity.label}
              onChange={(e) => handleUpdate(index, { label: e.target.value })}
              className="flex-1 h-10 px-3 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] text-sm font-medium text-[var(--ink-1)] focus:border-[var(--flag)] focus:outline-none"
              placeholder="Activity label"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleRemove(index)}
              className="h-10 w-10 text-[var(--ink-3)] hover:bg-[var(--bg-danger)] hover:text-[var(--ink-danger)] transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {activities.length < 10 && (
          <Button
            variant="outline"
            className="w-full h-11 border-dashed border-2 hover:bg-[var(--bg-card)] text-[var(--ink-2)]"
            onClick={handleAdd}
          >
            <Plus className="h-4 w-4 mr-2" /> Add Activity
          </Button>
        )}
      </div>

      <DiffModal
        isOpen={isPullModalOpen}
        onClose={() => setIsPullModalOpen(false)}
        onConfirm={confirmPull}
        title="Pull from Backend"
        confirmLabel="Apply Remote Settings"
        localActivities={activities}
        localDisplayCount={displayCount}
        remoteActivities={remoteQueryData?.activities || []}
        remoteDisplayCount={remoteQueryData?.displayCount || 0}
      />

      <DiffModal
        isOpen={isPushModalOpen}
        onClose={() => setIsPushModalOpen(false)}
        onConfirm={confirmPush}
        title="Push to Backend"
        confirmLabel="Overwrite Backend"
        localActivities={activities}
        localDisplayCount={displayCount}
        remoteActivities={remoteQueryData?.activities || []}
        remoteDisplayCount={remoteQueryData?.displayCount || 0}
      />
    </div>
  );
}

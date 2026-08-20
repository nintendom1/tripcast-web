import { cn } from "../../lib/utils";

export const MOTION_ACTIVITY_DEFINITIONS = [
  {
    key: "walking",
    title: "Walking",
    defaultLabel: "Walking",
    defaultEmoji: "🚶",
    labelField: "movementWalkingLabel",
    emojiField: "movementWalkingEmoji",
  },
  {
    key: "running",
    title: "Running",
    defaultLabel: "Running",
    defaultEmoji: "🏃",
    labelField: "movementRunningLabel",
    emojiField: "movementRunningEmoji",
  },
  {
    key: "cycling",
    title: "Cycling",
    defaultLabel: "Cycling",
    defaultEmoji: "🚲",
    labelField: "movementCyclingLabel",
    emojiField: "movementCyclingEmoji",
  },
  {
    key: "automotive",
    title: "Vehicle",
    defaultLabel: "Vehicle",
    defaultEmoji: "🚗",
    labelField: "movementVehicleLabel",
    emojiField: "movementVehicleEmoji",
  },
] as const;

export type MotionActivityKey = (typeof MOTION_ACTIVITY_DEFINITIONS)[number]["key"];
export type MotionActivityValues = Record<MotionActivityKey, { label: string; emoji: string }>;

export const DEFAULT_MOTION_ACTIVITY_VALUES: MotionActivityValues = Object.fromEntries(
  MOTION_ACTIVITY_DEFINITIONS.map((definition) => [
    definition.key,
    { label: definition.defaultLabel, emoji: definition.defaultEmoji },
  ]),
) as MotionActivityValues;

export type MovementDetectionUpdate = Partial<{
  movementDetectionEnabled: boolean;
  movementWalkingLabel: string;
  movementWalkingEmoji: string;
  movementRunningLabel: string;
  movementRunningEmoji: string;
  movementCyclingLabel: string;
  movementCyclingEmoji: string;
  movementVehicleLabel: string;
  movementVehicleEmoji: string;
  movementOverridesSleep: boolean;
}>;

export interface MovementDetectionSettingsProps {
  enabled: boolean;
  activities: MotionActivityValues;
  overridesSleep: boolean;
  nativePlatform: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onActivitiesChange: (activities: MotionActivityValues) => void;
  onOverridesSleepChange: (enabled: boolean) => void;
  onUpdate: (update: MovementDetectionUpdate) => void;
  onOpenDiagnostics: () => void;
}

const inputClass =
  "rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] text-[var(--ink-1)] outline-none focus:border-[var(--flag)] focus:ring-1 focus:ring-[var(--flag)]";

function SettingToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2.5 text-[var(--ink-1)]">
      <span className="text-sm font-medium">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
          checked ? "bg-[var(--flag)]" : "bg-[var(--meter-track)]",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-[var(--bg-card)] shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  );
}

export function MovementDetectionSettings({
  enabled,
  activities,
  overridesSleep,
  nativePlatform,
  onEnabledChange,
  onActivitiesChange,
  onOverridesSleepChange,
  onUpdate,
  onOpenDiagnostics,
}: MovementDetectionSettingsProps) {
  const updateActivity = (
    key: MotionActivityKey,
    field: "label" | "emoji",
    value: string,
  ) => {
    onActivitiesChange({ ...activities, [key]: { ...activities[key], [field]: value } });
  };

  return (
    <div className="grid gap-3">
      <SettingToggle
        label="Detect movement while Live is on"
        checked={enabled}
        onChange={(next) => {
          onEnabledChange(next);
          onUpdate({ movementDetectionEnabled: next });
        }}
      />
      {enabled && (
        <div className="grid gap-3 pt-2">
          {!nativePlatform && (
            <p className="rounded-md border border-[var(--line-soft)] bg-[var(--meter-track)] px-3 py-2 text-xs text-[var(--ink-2)]">
              Requires the iOS app — settings are saved, but classification only runs on iPhone.
            </p>
          )}
          {MOTION_ACTIVITY_DEFINITIONS.map((definition) => {
            const value = activities[definition.key];
            return (
              <div key={definition.key} className="grid gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                  {definition.title}
                </label>
                <div className="grid grid-cols-[72px_1fr] gap-2">
                  <input
                    type="text"
                    value={value.emoji}
                    onChange={(event) => updateActivity(definition.key, "emoji", event.target.value.slice(0, 10))}
                    onBlur={() => {
                      const emoji = value.emoji.trim() || definition.defaultEmoji;
                      updateActivity(definition.key, "emoji", emoji);
                      onUpdate({ [definition.emojiField]: emoji });
                    }}
                    maxLength={10}
                    placeholder={definition.defaultEmoji}
                    aria-label={`${definition.title} emoji`}
                    className={cn("h-9 px-3 text-sm", inputClass)}
                  />
                  <input
                    type="text"
                    value={value.label}
                    onChange={(event) => updateActivity(definition.key, "label", event.target.value.slice(0, 80))}
                    onBlur={() => {
                      const label = value.label.trim() || definition.defaultLabel;
                      updateActivity(definition.key, "label", label);
                      onUpdate({ [definition.labelField]: label });
                    }}
                    maxLength={80}
                    aria-label={`${definition.title} label`}
                    className={cn("h-9 px-3 text-sm", inputClass)}
                  />
                </div>
              </div>
            );
          })}
          <SettingToggle
            label="Movement overrides Sleeping"
            checked={overridesSleep}
            onChange={(next) => {
              onOverridesSleepChange(next);
              onUpdate({ movementOverridesSleep: next });
            }}
          />
          <button
            type="button"
            onClick={onOpenDiagnostics}
            className="rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--meter-track)] hover:text-[var(--ink-1)]"
          >
            Motion Diagnostics
          </button>
        </div>
      )}
    </div>
  );
}

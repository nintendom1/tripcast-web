import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  DEFAULT_MOTION_ACTIVITY_VALUES,
  MovementDetectionSettings,
  type MovementDetectionSettingsProps,
  type MotionActivityValues,
} from "./MovementDetectionSettings";

const meta = {
  title: "TravelState/MovementDetectionSettings",
  component: MovementDetectionSettings,
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-[var(--bg-paper)] p-4 text-[var(--ink-1)]">
        <div className="mx-auto max-w-md rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-3">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof MovementDetectionSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlledSettings(args: MovementDetectionSettingsProps) {
  const [enabled, setEnabled] = useState(args.enabled);
  const [activities, setActivities] = useState<MotionActivityValues>(args.activities);
  const [overridesSleep, setOverridesSleep] = useState(args.overridesSleep);
  return (
    <MovementDetectionSettings
      {...args}
      enabled={enabled}
      activities={activities}
      overridesSleep={overridesSleep}
      onEnabledChange={setEnabled}
      onActivitiesChange={setActivities}
      onOverridesSleepChange={setOverridesSleep}
    />
  );
}

/** @tag ai-generated */
export const EnabledOnIPhone: Story = {
  args: {
    enabled: true,
    activities: DEFAULT_MOTION_ACTIVITY_VALUES,
    overridesSleep: true,
    nativePlatform: true,
    onEnabledChange: () => {},
    onActivitiesChange: () => {},
    onOverridesSleepChange: () => {},
    onUpdate: () => {},
    onOpenDiagnostics: () => {},
  },
  render: (args) => <ControlledSettings {...args} />,
};

/** @tag ai-generated */
export const WebNotice: Story = {
  ...EnabledOnIPhone,
  args: { ...EnabledOnIPhone.args!, nativePlatform: false },
};

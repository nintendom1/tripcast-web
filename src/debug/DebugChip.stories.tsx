import type { Meta, StoryObj } from "@storybook/react";
import { DebugChip } from "./DebugChip";
import { setEnabled, log } from "./debugLogger";
import { setActiveUiContext, setFloatingDebugButtonMode } from "./activeUiContext";
import { useEffect } from "react";

/** @tag ai-generated */
const meta: Meta<typeof DebugChip> = {
  title: "Debug/DebugChip",
  component: DebugChip,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => {
      useEffect(() => {
        setEnabled(true);
        setActiveUiContext("story", {
          sheetName: "Storybook",
          label: "Preview",
          sourceLabel: "Storybook -> Preview",
        });
        log("info", "Storybook", "mounted", "ui");
      }, []);
      return (
        <div className="h-screen w-screen bg-gray-50 p-8">
          <p className="text-sm text-gray-500 mb-4">
            Drag the debug chip around and release to see it snap to the nearest edge.
            Tapping without dragging should trigger the open action.
          </p>
          <Story />
        </div>
      );
    },
  ],
};

export default meta;
type Story = StoryObj<typeof DebugChip>;

export const Default: Story = {
  args: {
    onOpen: () => alert("Debug panel opened!"),
  },
};

export const Compact: Story = {
  args: {
    onOpen: () => alert("Debug panel opened!"),
  },
  decorators: [
    (Story) => {
      useEffect(() => {
        setFloatingDebugButtonMode("compact-context");
      }, []);
      return <Story />;
    },
  ],
};

export const Detailed: Story = {
  args: {
    onOpen: () => alert("Debug panel opened!"),
  },
  decorators: [
    (Story) => {
      useEffect(() => {
        setFloatingDebugButtonMode("detailed-context");
      }, []);
      return <Story />;
    },
  ],
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { DebugChip } from "./DebugChip";
import { setEnabled, log } from "./debugLogger";
import { setActiveUiContext, setFloatingDebugButtonMode } from "./activeUiContext";
import { useEffect, useState } from "react";

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

export const ResizingContext: Story = {
  args: {
    onOpen: () => alert("Debug panel opened!"),
  },
  decorators: [
    (Story) => {
      const [expanded, setExpanded] = useState(false);

      useEffect(() => {
        setFloatingDebugButtonMode("compact-context");
      }, []);

      useEffect(() => {
        setActiveUiContext("story", {
          sheetName: expanded ? "Very Long Storybook Sheet Name" : "Map",
          label: expanded ? "Preview With A Much Longer Active Label" : "Preview",
          sourceLabel: expanded ? "Storybook -> Resize Compensation" : "Storybook -> Map",
        });
      }, [expanded]);

      return (
        <>
          <button
            type="button"
            className="fixed bottom-6 left-6 z-[1] rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white shadow"
            onClick={() => setExpanded((current) => !current)}
          >
            Toggle chip text
          </button>
          <Story />
        </>
      );
    },
  ],
};

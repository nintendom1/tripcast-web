import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import QuickActivitySettingsView, { getQuickActivitySettings } from "./QuickActivitySettings";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const STORAGE_KEY = "tripcast.quick_activities_settings";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn().mockResolvedValue(null) as any);
  vi.mocked(convexReact.useQuery).mockReturnValue({
    activities: [{ label: "Remote", emoji: "📡" }],
    displayCount: 1,
    updatedAt: Date.now(),
    updatedBySessionId: "session",
  } as any);
});

describe("QuickActivitySettingsView", () => {
  it("allows a label to be cleared with a bulk edit without remounting the input", () => {
    render(<QuickActivitySettingsView token="test-token" />);

    const labelInput = screen.getByRole("textbox", { name: /quick activity 1 label/i });
    labelInput.focus();
    fireEvent.change(labelInput, { target: { value: "" } });

    expect(labelInput).toHaveFocus();
    expect(labelInput).toHaveValue("");
    expect(getQuickActivitySettings().activities[0]).toEqual({ label: "Eating", emoji: "🍽️" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("resets quick activities to defaults locally", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        activities: [{ label: "Coffee", emoji: "☕" }],
        displayCount: 1,
      }),
    );

    render(<QuickActivitySettingsView token="test-token" />);
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));

    const saved = getQuickActivitySettings();
    expect(saved.activities).toHaveLength(8);
    expect(saved.activities[0]).toEqual({ label: "Walking", emoji: "🚶" });
    expect(saved.activities[7]).toEqual({ label: "Sleeping", emoji: "🛏️" });
    expect(saved.displayCount).toBe(8);
    expect(screen.getByRole("status")).toHaveTextContent(/reset to defaults/i);
  });
});

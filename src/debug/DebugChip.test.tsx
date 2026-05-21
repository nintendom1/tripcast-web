import { act } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebugChip } from "./DebugChip";
import { clearLogs, log, setEnabled, setPreset } from "./debugLogger";
import {
  resetActiveUiContextForTests,
  setActiveUiContext,
  setFloatingDebugButtonMode,
  setFloatingDebugShowSource,
} from "./activeUiContext";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  clearLogs();
  resetActiveUiContextForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DebugChip", () => {
  it("hides when debug logging is disabled", () => {
    setEnabled(false);
    render(<DebugChip onOpen={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /open debug panel/i })).not.toBeInTheDocument();
  });

  it("updates the log count when entries arrive", () => {
    setEnabled(true);
    setPreset("normal");
    setFloatingDebugButtonMode("log-count");
    render(<DebugChip onOpen={vi.fn()} />);

    expect(screen.getByRole("button", { name: /open debug panel/i })).toHaveTextContent("0");

    act(() => {
      log("info", "Test", "action", "ui");
    });

    expect(screen.getByRole("button", { name: /open debug panel/i })).toHaveTextContent("1");
  });

  it("clears the blink timer when unmounted", () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    setEnabled(true);
    setPreset("normal");
    setFloatingDebugButtonMode("log-count");
    const { unmount } = render(<DebugChip onOpen={vi.fn()} />);

    act(() => {
      log("info", "Test", "action", "ui");
    });
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("shows compact active context as label and implementation name", () => {
    setEnabled(true);
    setFloatingDebugButtonMode("compact-context");
    setActiveUiContext("journal", {
      sheetName: "JournalSheet",
      label: "Journal",
      sourceLabel: "Dock -> Journal",
    });

    render(<DebugChip onOpen={vi.fn()} />);

    expect(screen.getByRole("button", { name: /open debug panel/i })).toHaveTextContent(
      "Debug · Journal -> JournalSheet",
    );
  });

  it("shows detailed active context and can hide source", () => {
    setEnabled(true);
    setPreset("normal");
    setFloatingDebugButtonMode("detailed-context");
    setFloatingDebugShowSource(false);
    setActiveUiContext("missions", {
      sheetName: "MissionPanel",
      label: "Missions",
      sourceLabel: "Dock -> Missions",
    });

    render(<DebugChip onOpen={vi.fn()} />);

    const button = screen.getByRole("button", { name: /open debug panel/i });
    expect(button).toHaveTextContent("Debug (0)");
    expect(button).toHaveTextContent("Active: MissionPanel");
    expect(button).not.toHaveTextContent("Source:");
  });
});

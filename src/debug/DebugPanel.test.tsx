import { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DebugPanel from "./DebugPanel";
import { clearLogs, getLogs, setEnabled, setPreset } from "./debugLogger";
import {
  getFloatingDebugSettings,
  resetActiveUiContextForTests,
  setActiveUiContext,
} from "./activeUiContext";

beforeEach(() => {
  localStorage.clear();
  clearLogs();
  resetActiveUiContextForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
});

describe("DebugPanel", () => {
  it("disables debug options when logging is off", () => {
    setEnabled(false);
    render(<DebugPanel onBack={vi.fn()} />);

    expect(screen.getByRole("switch", { name: /debug logging/i })).not.toBeDisabled();
    expect(screen.getByRole("switch", { name: /redact location in copies/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /minimal/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /normal/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /refresh/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /clear logs/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /download json/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^copy json$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /copy debug summary/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /copy current context/i })).toBeDisabled();
    expect(screen.getByLabelText(/ui/i)).toBeDisabled();
  });

  it("enables debug options when logging is on", () => {
    setEnabled(true);
    render(<DebugPanel onBack={vi.fn()} />);

    expect(screen.getByRole("switch", { name: /redact location in copies/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /minimal/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /refresh/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /copy debug summary/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /copy current context/i })).not.toBeDisabled();
    expect(screen.getByLabelText(/ui/i)).not.toBeDisabled();
  });

  it("updates floating Debug button settings", () => {
    setEnabled(true);
    setPreset("verbose");
    render(<DebugPanel onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /compact/i }));
    fireEvent.click(screen.getByRole("switch", { name: /show source opened by/i }));
    fireEvent.click(screen.getByRole("switch", { name: /include file path in copies/i }));

    expect(getFloatingDebugSettings()).toEqual({
      buttonMode: "compact-context",
      showSource: false,
      includeFileInCopies: false,
    });
    expect(getLogs().some((entry) => entry.action === "debug:floating-context-setting:update")).toBe(true);
  });

  it("copies current context", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    setEnabled(true);
    setActiveUiContext("story", {
      sheetName: "StoryDetailSheet",
      label: "Story detail",
      view: "narrative",
      sourceLabel: "Journal -> Story",
    });

    render(<DebugPanel onBack={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy current context/i }));
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Active sheet: StoryDetailSheet"));
    expect(screen.getByRole("status")).toHaveTextContent(/copied current context/i);
  });

  it("restarts the copy status timer on repeated copies", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    setEnabled(true);
    render(<DebugPanel onBack={vi.fn()} />);
    const copyButton = screen.getByRole("button", { name: /copy debug summary/i });

    await act(async () => {
      fireEvent.click(copyButton);
    });
    expect(screen.getByRole("status")).toHaveTextContent(/copied debug summary/i);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    await act(async () => {
      fireEvent.click(copyButton);
    });
    expect(writeText).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("downloads JSON when fallback clipboard copy reports failure", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const execCommand = vi.fn().mockReturnValue(false);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:debug-json");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    setEnabled(true);
    render(<DebugPanel onBack={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^copy json$/i }));
    });

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(createObjectUrl).toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:debug-json");
    expect(screen.getByRole("status")).toHaveTextContent(/downloaded json/i);
  });
});

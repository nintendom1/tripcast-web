import { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DebugPanel from "./DebugPanel";
import { clearLogs, setEnabled } from "./debugLogger";

beforeEach(() => {
  localStorage.clear();
  clearLogs();
});

afterEach(() => {
  vi.useRealTimers();
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
    expect(screen.getByLabelText(/ui/i)).toBeDisabled();
  });

  it("enables debug options when logging is on", () => {
    setEnabled(true);
    render(<DebugPanel onBack={vi.fn()} />);

    expect(screen.getByRole("switch", { name: /redact location in copies/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /minimal/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /refresh/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /copy debug summary/i })).not.toBeDisabled();
    expect(screen.getByLabelText(/ui/i)).not.toBeDisabled();
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
});

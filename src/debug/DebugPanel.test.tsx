import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DebugPanel from "./DebugPanel";
import { clearLogs, setEnabled } from "./debugLogger";

beforeEach(() => {
  localStorage.clear();
  clearLogs();
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
});

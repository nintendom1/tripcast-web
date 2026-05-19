import { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import CreateInviteControl from "./CreateInviteControl";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(convexReact.useMutation).mockReturnValue(
    vi.fn().mockResolvedValue({ inviteToken: "invite-tok" }) as any,
  );
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
});

describe("CreateInviteControl", () => {
  it("restarts the copied state timer on repeated copies", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<CreateInviteControl token="test-token" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /create invite link/i }));
    });

    const copyButton = screen.getByRole("button", { name: /copy invite link/i });

    await act(async () => {
      fireEvent.click(copyButton);
    });
    expect(copyButton).toHaveTextContent(/copied/i);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await act(async () => {
      fireEvent.click(copyButton);
    });
    expect(writeText).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(copyButton).toHaveTextContent(/copied/i);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(copyButton).toHaveTextContent(/copy invite link/i);
  });

  it("shows a manual copy error when clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    render(<CreateInviteControl token="test-token" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /create invite link/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy invite link/i }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/select and copy the invite link manually/i);
  });
});

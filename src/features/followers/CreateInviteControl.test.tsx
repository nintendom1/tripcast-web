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
  vi.unstubAllEnvs();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
});

describe("CreateInviteControl", () => {
  it("creates single-use invites from Invite One", async () => {
    const createInvite = vi.fn().mockResolvedValue({ inviteToken: "invite-one-tok" });
    vi.mocked(convexReact.useMutation).mockReturnValue(createInvite as any);

    render(<CreateInviteControl token="test-token" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /invite one/i }));
    });

    expect(createInvite).toHaveBeenCalledWith({ token: "test-token", mode: "single" });
    expect(screen.getByText(/usable once/i)).toBeInTheDocument();
  });

  it("creates reusable invites from Invite many", async () => {
    const createInvite = vi.fn().mockResolvedValue({ inviteToken: "invite-many-tok" });
    vi.mocked(convexReact.useMutation).mockReturnValue(createInvite as any);

    render(<CreateInviteControl token="test-token" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /invite many/i }));
    });

    expect(createInvite).toHaveBeenCalledWith({ token: "test-token", mode: "multi" });
    expect(screen.getByText(/reusable until it expires/i)).toBeInTheDocument();
  });

  it("uses the configured public app URL for invite links", async () => {
    vi.stubEnv("VITE_PUBLIC_APP_URL", "https://nintendom1.github.io/tripcast-web");

    render(<CreateInviteControl token="test-token" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /invite one/i }));
    });

    expect(screen.getByText("https://nintendom1.github.io/tripcast-web/?invite=invite-tok")).toBeInTheDocument();
  });

  it("falls back to the Vite base URL for local invite links", async () => {
    vi.stubEnv("VITE_PUBLIC_APP_URL", "");
    vi.stubEnv("BASE_URL", "/tripcast-web/");

    render(<CreateInviteControl token="test-token" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /invite one/i }));
    });

    expect(screen.getByText("http://localhost:3000/tripcast-web/?invite=invite-tok")).toBeInTheDocument();
  });

  it("restarts the copied state timer on repeated copies", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<CreateInviteControl token="test-token" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /invite one/i }));
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
      fireEvent.click(screen.getByRole("button", { name: /invite one/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy invite link/i }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/select and copy the invite link manually/i);
  });
});

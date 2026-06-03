import { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import FollowerManagementPanel from "./FollowerManagementPanel";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const MOCK_FOLLOWERS = [
  {
    userId: "user1",
    username: "alice",
    displayName: "Alice",
    membershipStatus: "active" as const,
    isBanned: false,
    createdAt: Date.now(),
  },
  {
    userId: "user2",
    username: "bob",
    displayName: "Bob",
    membershipStatus: "active" as const,
    isBanned: true,
    createdAt: Date.now(),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(convexReact.useQuery).mockReturnValue(MOCK_FOLLOWERS as any);
  vi.mocked(convexReact.useMutation).mockImplementation(
    () => vi.fn().mockResolvedValue(null) as any,
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

describe("FollowerManagementPanel", () => {
  it("renders follower list from query", () => {
    render(<FollowerManagementPanel token="test-token" />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(screen.getByText("@bob")).toBeInTheDocument();
  });

  it("shows Banned badge for banned followers only", () => {
    render(<FollowerManagementPanel token="test-token" />);
    expect(screen.getByText("Banned")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(screen.queryByText("Revoked")).not.toBeInTheDocument();
  });

  it("shows Ban button for active followers and Unban for banned", () => {
    render(<FollowerManagementPanel token="test-token" />);
    expect(screen.getByRole("button", { name: /^ban$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^unban$/i })).toBeInTheDocument();
  });

  it("does not show Revoke access or Restore access buttons", () => {
    render(<FollowerManagementPanel token="test-token" />);
    expect(screen.queryByRole("button", { name: /revoke/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument();
  });

  it("shows loading state while query is undefined", () => {
    vi.mocked(convexReact.useQuery).mockReturnValue(undefined as any);
    render(<FollowerManagementPanel token="test-token" />);
    expect(screen.getByText(/loading followers/i)).toBeInTheDocument();
  });

  it("shows empty state when no followers", () => {
    vi.mocked(convexReact.useQuery).mockReturnValue([] as any);
    render(<FollowerManagementPanel token="test-token" />);
    expect(screen.getByText(/no followers yet/i)).toBeInTheDocument();
  });

  it("shows confirmation dialog when Ban is clicked", async () => {
    render(<FollowerManagementPanel token="test-token" />);
    await userEvent.click(screen.getByRole("button", { name: /^ban$/i }));
    expect(screen.getByText(/ban @alice/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("calls banUser mutation on confirmation", async () => {
    const mockBan = vi.fn().mockResolvedValue(null);
    vi.mocked(convexReact.useMutation).mockImplementation(
      () => mockBan as any,
    );

    render(<FollowerManagementPanel token="test-token" />);
    await userEvent.click(screen.getByRole("button", { name: /^ban$/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(mockBan).toHaveBeenCalledWith({ token: "test-token", userId: "user1" });
  });

  it("dismisses confirmation on Cancel", async () => {
    render(<FollowerManagementPanel token="test-token" />);
    await userEvent.click(screen.getByRole("button", { name: /^ban$/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();
  });

  it("shows Issue reset confirmation and calls mutation", async () => {
    const mockReset = vi.fn().mockResolvedValue({ resetToken: "reset-tok-abc" });
    vi.mocked(convexReact.useMutation).mockImplementation(
      () => mockReset as any,
    );

    render(<FollowerManagementPanel token="test-token" />);
    const resetButtons = screen.getAllByRole("button", { name: /issue reset/i });
    await userEvent.click(resetButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(mockReset).toHaveBeenCalledWith({ token: "test-token", userId: "user1" });
    expect(await screen.findByText(/password reset link/i)).toBeInTheDocument();
  });

  it("uses the configured public app URL for the password reset link", async () => {
    vi.stubEnv("VITE_PUBLIC_APP_URL", "https://nintendom1.github.io/tripcast-web");
    const mockReset = vi.fn().mockResolvedValue({ resetToken: "reset-tok-abc" });
    vi.mocked(convexReact.useMutation).mockImplementation(
      () => mockReset as any,
    );

    render(<FollowerManagementPanel token="test-token" />);
    const resetButtons = screen.getAllByRole("button", { name: /issue reset/i });
    await userEvent.click(resetButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(
      await screen.findByText("https://nintendom1.github.io/tripcast-web/?reset=reset-tok-abc"),
    ).toBeInTheDocument();
  });

  it("restarts the reset link copied state timer on repeated copies", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const mockValues = [
      vi.fn().mockResolvedValue(null),
      vi.fn().mockResolvedValue(null),
      vi.fn().mockResolvedValue({ resetToken: "reset-tok-abc" }),
      vi.fn().mockResolvedValue(null),
    ];
    let callCount = 0;
    vi.mocked(convexReact.useMutation).mockImplementation(
      () => mockValues[callCount++ % mockValues.length] as any,
    );

    render(<FollowerManagementPanel token="test-token" />);
    const resetButtons = screen.getAllByRole("button", { name: /issue reset/i });
    await act(async () => {
      fireEvent.click(resetButtons[0]);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    });

    const copyButton = screen.getByRole("button", { name: /copy link/i });
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
    expect(copyButton).toHaveTextContent(/copy link/i);
  });

  it("shows a manual copy error when reset-link clipboard write is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const mockValues = [
      vi.fn().mockResolvedValue(null),
      vi.fn().mockResolvedValue(null),
      vi.fn().mockResolvedValue({ resetToken: "reset-tok-abc" }),
      vi.fn().mockResolvedValue(null),
    ];
    let callCount = 0;
    vi.mocked(convexReact.useMutation).mockImplementation(
      () => mockValues[callCount++ % mockValues.length] as any,
    );

    render(<FollowerManagementPanel token="test-token" />);
    const resetButtons = screen.getAllByRole("button", { name: /issue reset/i });
    await act(async () => {
      fireEvent.click(resetButtons[0]);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/select and copy the reset link manually/i);
  });
});

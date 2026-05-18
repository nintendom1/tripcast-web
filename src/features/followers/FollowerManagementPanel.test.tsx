import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import FollowerLoginScreen from "./FollowerLoginScreen";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
}));

const mockOnSignIn = vi.fn();
const mockOnShowInvite = vi.fn();
const mockOnShowTravelerLogin = vi.fn();

function renderScreen() {
  render(
    <FollowerLoginScreen
      onSignIn={mockOnSignIn}
      onShowInvite={mockOnShowInvite}
      onShowTravelerLogin={mockOnShowTravelerLogin}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn() as any);
});

describe("FollowerLoginScreen", () => {
  it("renders username, password, remember-me, and submit button", () => {
    renderScreen();
    expect(screen.getByPlaceholderText("your-username")).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/remember me/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
  });

  it("submit button is disabled when fields are empty", () => {
    renderScreen();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeDisabled();
  });

  it("calls onSignIn with session on successful login", async () => {
    const mockSignIn = vi.fn().mockResolvedValue({ token: "tok-123" });
    vi.mocked(convexReact.useMutation).mockReturnValue(mockSignIn as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    renderScreen();

    await userEvent.type(screen.getByPlaceholderText("your-username"), "alice");
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(mockSignIn).toHaveBeenCalledWith({
      username: "alice",
      password: "password123",
      rememberMe: false,
    });
    expect(mockOnSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ token: "tok-123", role: "support_crew", sessionType: "follower" }),
    );
  });

  it("shows error message on failed login", async () => {
    const mockSignIn = vi.fn().mockRejectedValue(new Error("Incorrect username or password"));
    vi.mocked(convexReact.useMutation).mockReturnValue(mockSignIn as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    renderScreen();

    await userEvent.type(screen.getByPlaceholderText("your-username"), "alice");
    await userEvent.type(screen.getByLabelText(/^password$/i), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows lockout message on lockout error", async () => {
    const mockSignIn = vi.fn().mockRejectedValue(new Error("locked out"));
    vi.mocked(convexReact.useMutation).mockReturnValue(mockSignIn as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    renderScreen();

    await userEvent.type(screen.getByPlaceholderText("your-username"), "alice");
    await userEvent.type(screen.getByLabelText(/^password$/i), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/15 minutes/i);
  });

  it("calls onShowInvite when invite link is clicked", async () => {
    renderScreen();
    await userEvent.click(screen.getByText(/i have an invite link/i));
    expect(mockOnShowInvite).toHaveBeenCalled();
  });

  it("calls onShowTravelerLogin when traveler link is clicked", async () => {
    renderScreen();
    await userEvent.click(screen.getByText(/sign in as traveler/i));
    expect(mockOnShowTravelerLogin).toHaveBeenCalled();
  });
});

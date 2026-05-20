import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import FollowerLoginScreen from "./FollowerLoginScreen";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
}));

const mockOnSignIn = vi.fn();
const mockOnShowTravelerLogin = vi.fn();

function renderScreen() {
  render(
    <FollowerLoginScreen
      onSignIn={mockOnSignIn}
      onShowTravelerLogin={mockOnShowTravelerLogin}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();

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
    vi.mocked(convexReact.useMutation).mockReturnValue(mockSignIn as any);
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
      expect.objectContaining({ token: "tok-123", role: "follower", sessionType: "follower" }),
    );
  });

  it("shows error message on failed login", async () => {
    const mockSignIn = vi.fn().mockRejectedValue(new Error("Incorrect username or password"));
    vi.mocked(convexReact.useMutation).mockReturnValue(mockSignIn as any);
    renderScreen();

    await userEvent.type(screen.getByPlaceholderText("your-username"), "alice");
    await userEvent.type(screen.getByLabelText(/^password$/i), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows lockout message on lockout error", async () => {
    const mockSignIn = vi.fn().mockRejectedValue(new Error("locked out"));
    vi.mocked(convexReact.useMutation).mockReturnValue(mockSignIn as any);
    renderScreen();

    await userEvent.type(screen.getByPlaceholderText("your-username"), "alice");
    await userEvent.type(screen.getByLabelText(/^password$/i), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/15 minutes/i);
  });

  it("calls onShowTravelerLogin when traveler link is clicked", async () => {
    renderScreen();
    await userEvent.click(screen.getByText(/sign in as traveler/i));
    expect(mockOnShowTravelerLogin).toHaveBeenCalled();
  });

  it("shows delayed connection feedback while sign-in is still pending", async () => {
    vi.useFakeTimers();
    const mockSignIn = vi.fn(() => new Promise(() => {}));
    vi.mocked(convexReact.useMutation).mockReturnValue(mockSignIn as any);

    renderScreen();

    fireEvent.change(screen.getByPlaceholderText("your-username"), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByRole("status")).toHaveTextContent(/still trying to finish this sign-in/i);
    vi.useRealTimers();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import InviteRedemptionScreen from "./InviteRedemptionScreen";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
}));

const mockOnSignIn = vi.fn();
const mockOnBack = vi.fn();

function renderScreen(inviteToken = "test-invite-token") {
  render(
    <InviteRedemptionScreen
      inviteToken={inviteToken}
      onSignIn={mockOnSignIn}
      onBack={mockOnBack}
    />,
  );
}

async function fillForm({
  username = "alice",
  password = "password123",
  confirmPassword = "password123",
  acceptTerms = true,
}: {
  username?: string;
  password?: string;
  confirmPassword?: string;
  acceptTerms?: boolean;
} = {}) {
  await userEvent.type(screen.getByLabelText(/^username/i), username);
  await userEvent.type(screen.getByLabelText(/^password/i), password);
  await userEvent.type(screen.getByLabelText(/confirm password/i), confirmPassword);
  if (acceptTerms) {
    await userEvent.click(screen.getByLabelText(/agree to the terms/i));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn() as any);
});

describe("InviteRedemptionScreen", () => {
  it("renders all required fields", () => {
    renderScreen();
    expect(screen.getByLabelText(/^username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/agree to the terms/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("submit button is disabled when form is empty", () => {
    renderScreen();
    expect(screen.getByRole("button", { name: /create account/i })).toBeDisabled();
  });

  it("calls onSignIn with session on successful redemption", async () => {
    const mockRedeem = vi.fn().mockResolvedValue({ token: "new-session-token" });
    vi.mocked(convexReact.useMutation).mockReturnValue(mockRedeem as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    renderScreen("my-invite-token");

    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(mockRedeem).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteToken: "my-invite-token",
        username: "alice",
      }),
    );
    expect(mockOnSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ token: "new-session-token", sessionType: "follower" }),
    );
  });

  it("shows error on expired invite", async () => {
    const mockRedeem = vi.fn().mockRejectedValue(new Error("expired"));
    vi.mocked(convexReact.useMutation).mockReturnValue(mockRedeem as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    renderScreen();

    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/expired/i);
  });

  it("shows error on duplicate username", async () => {
    const mockRedeem = vi.fn().mockRejectedValue(new Error("username already taken"));
    vi.mocked(convexReact.useMutation).mockReturnValue(mockRedeem as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    renderScreen();

    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/taken/i);
  });

  it("calls onBack when Back button is clicked", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(mockOnBack).toHaveBeenCalled();
  });

  it("shows password mismatch message when passwords differ", async () => {
    renderScreen();
    await userEvent.type(screen.getByLabelText(/^password/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "different");
    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeDisabled();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import InviteRedemptionScreen from "./InviteRedemptionScreen";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
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

  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn() as any);
  vi.mocked(convexReact.useQuery).mockReturnValue({ status: "valid" } as any);
});

describe("InviteRedemptionScreen", () => {
  it("shows loading state when invite status is pending", () => {
    vi.mocked(convexReact.useQuery).mockReturnValue(undefined);
    renderScreen();
    expect(screen.getByLabelText(/checking invite status/i)).toBeInTheDocument();
    expect(screen.getByText(/checking invite…/i)).toBeInTheDocument();
  });

  it("shows expired message when invite is expired", () => {
    vi.mocked(convexReact.useQuery).mockReturnValue({ status: "expired" });
    renderScreen();
    expect(screen.getByText(/invite expired/i)).toBeInTheDocument();
    expect(screen.getByText(/has expired/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^username/i)).not.toBeInTheDocument();
  });

  it("shows used message when invite is already used", () => {
    vi.mocked(convexReact.useQuery).mockReturnValue({ status: "already_used" });
    renderScreen();
    expect(screen.getByText(/invite used/i)).toBeInTheDocument();
    expect(screen.getByText(/already been used/i)).toBeInTheDocument();
  });

  it("shows invalid message when invite is invalid", () => {
    vi.mocked(convexReact.useQuery).mockReturnValue({ status: "invalid" });
    renderScreen();
    expect(screen.getByText(/invalid link/i)).toBeInTheDocument();
    expect(screen.getByText(/link is invalid/i)).toBeInTheDocument();
  });

  it("renders all required fields when invite is valid", () => {
    renderScreen();
    expect(screen.getByLabelText(/^username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/agree to the terms/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /terms of service/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /privacy policy/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("shows the trip feature introduction alongside registration", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: /follow the traveler/i })).toBeInTheDocument();
    expect(screen.getByText(/read what they post from each stop/i)).toBeInTheDocument();
    expect(screen.getByText(/suggest something for the traveler to try/i)).toBeInTheDocument();
    expect(screen.getByText(/help choose between good options/i)).toBeInTheDocument();
    expect(screen.getByText(/see who helped shape the trip/i)).toBeInTheDocument();
  });

  it("submit button is disabled when form is empty", () => {
    renderScreen();
    expect(screen.getByRole("button", { name: /create account/i })).toBeDisabled();
  });

  it("calls onSignIn with session on successful redemption", async () => {
    const mockRedeem = vi.fn().mockResolvedValue({ token: "new-session-token" });
    vi.mocked(convexReact.useMutation).mockReturnValue(mockRedeem as any);
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
    vi.mocked(convexReact.useMutation).mockReturnValue(mockRedeem as any);
    renderScreen();

    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/expired/i);
  });

  it("shows error on duplicate username", async () => {
    const mockRedeem = vi.fn().mockRejectedValue(new Error("username already taken"));
    vi.mocked(convexReact.useMutation).mockReturnValue(mockRedeem as any);
    renderScreen();

    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/taken/i);
  });

  it("blocks usernames with spaces before redemption", async () => {
    const mockRedeem = vi.fn().mockResolvedValue({ token: "new-session-token" });
    vi.mocked(convexReact.useMutation).mockReturnValue(mockRedeem as any);
    renderScreen();

    await fillForm({ username: "ali ce" });

    expect(screen.getByText(/letters, numbers, underscores, and hyphens/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^username/i)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: /create account/i })).toBeDisabled();
    expect(mockRedeem).not.toHaveBeenCalled();
  });

  it("calls onBack when Back button is clicked", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(mockOnBack).toHaveBeenCalled();
  });

  it("opens scrollable legal documents from the agreement text", async () => {
    renderScreen();

    await userEvent.click(screen.getByRole("button", { name: /terms of service/i }));
    expect(screen.getByRole("dialog", { name: /terms of service/i })).toHaveTextContent("TRIPCAST TERMS OF SERVICE");

    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /privacy policy/i }));
    expect(screen.getByRole("dialog", { name: /privacy policy/i })).toHaveTextContent("TRIPCAST PRIVACY POLICY");
  });

  it("shows password mismatch message when passwords differ", async () => {
    renderScreen();
    await userEvent.type(screen.getByLabelText(/^password/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "different");
    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeDisabled();
  });
});

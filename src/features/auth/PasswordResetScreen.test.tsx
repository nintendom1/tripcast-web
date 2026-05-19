import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import PasswordResetScreen from "./PasswordResetScreen";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
}));

const mockOnDone = vi.fn();

function renderScreen(resetToken = "reset-token") {
  render(<PasswordResetScreen resetToken={resetToken} onDone={mockOnDone} />);
}

async function fillForm({
  password = "password123",
  confirmPassword = "password123",
}: {
  password?: string;
  confirmPassword?: string;
} = {}) {
  await userEvent.type(screen.getByLabelText(/^new password/i), password);
  await userEvent.type(screen.getByLabelText(/confirm new password/i), confirmPassword);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn() as any);
});

describe("PasswordResetScreen", () => {
  it("renders password reset fields", () => {
    renderScreen();

    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update password/i })).toBeDisabled();
  });

  it("shows mismatch feedback and blocks submit", async () => {
    renderScreen();

    await fillForm({ confirmPassword: "different123" });

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update password/i })).toBeDisabled();
  });

  it("consumes reset token and shows done state", async () => {
    const consumeReset = vi.fn().mockResolvedValue(null);
    vi.mocked(convexReact.useMutation).mockReturnValue(consumeReset as any);
    renderScreen("reset-token-123");

    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(consumeReset).toHaveBeenCalledWith({
      resetToken: "reset-token-123",
      newPassword: "password123",
    });
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(mockOnDone).toHaveBeenCalledTimes(1);
  });

  it("shows expired reset link errors", async () => {
    const consumeReset = vi.fn().mockRejectedValue(new Error("expired"));
    vi.mocked(convexReact.useMutation).mockReturnValue(consumeReset as any);
    renderScreen();

    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/expired/i);
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import AuthScreen from "./AuthScreen";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
}));

vi.mock("../../lib/clientId", () => ({
  getClientId: vi.fn(() => "client-123"),
}));

const mockOnSignIn = vi.fn();
const mockOnBack = vi.fn();

function renderScreen({ onBack }: { onBack?: (() => void) | undefined } = { onBack: mockOnBack }) {
  render(<AuthScreen onSignIn={mockOnSignIn} onBack={onBack} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn() as any);
});

describe("AuthScreen", () => {
  it("renders traveler code sign-in controls", () => {
    renderScreen();

    expect(screen.getByLabelText(/traveler code/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^back$/i })).toBeInTheDocument();
  });

  it("hides Back when no callback is provided", () => {
    renderScreen({ onBack: undefined });

    expect(screen.queryByRole("button", { name: /^back$/i })).not.toBeInTheDocument();
  });

  it("signs in with trimmed traveler code", async () => {
    const signIn = vi.fn().mockResolvedValue({ ok: true, token: "traveler-token", role: "traveler" });
    vi.mocked(convexReact.useMutation).mockReturnValue(signIn as any);
    renderScreen();

    await userEvent.type(screen.getByLabelText(/traveler code/i), "  trip-code  ");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(signIn).toHaveBeenCalledWith({
      role: "traveler",
      code: "trip-code",
      clientId: "client-123",
    });
    expect(mockOnSignIn).toHaveBeenCalledWith({
      token: "traveler-token",
      role: "traveler",
    });
  });

  it("shows invalid-code errors returned by the backend", async () => {
    const signIn = vi.fn().mockResolvedValue({ ok: false, error: "invalid_code" });
    vi.mocked(convexReact.useMutation).mockReturnValue(signIn as any);
    renderScreen();

    await userEvent.type(screen.getByLabelText(/traveler code/i), "wrong-code");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect code/i);
    expect(mockOnSignIn).not.toHaveBeenCalled();
  });

  it("shows rate-limit errors", async () => {
    const signIn = vi.fn().mockRejectedValue(new Error("too many attempts"));
    vi.mocked(convexReact.useMutation).mockReturnValue(signIn as any);
    renderScreen();

    await userEvent.type(screen.getByLabelText(/traveler code/i), "trip-code");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
  });

  it("calls Back callback", async () => {
    renderScreen();

    await userEvent.click(screen.getByRole("button", { name: /^back$/i }));

    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });
});

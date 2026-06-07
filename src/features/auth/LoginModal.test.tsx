import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as convexReact from "convex/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../../providers/ThemeProvider";
import LandingPage from "./LandingPage";
import LoginModal from "./LoginModal";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
}));

function renderWithTheme(ui: React.ReactNode) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function LandingWithLogin() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <LandingPage onLoginClick={() => setOpen(true)} />
      <LoginModal open={open} onOpenChange={setOpen} onSignIn={() => {}} />
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn() as any);
});

describe("LoginModal", () => {
  it("opens from the landing login button and defaults to follower sign in", async () => {
    renderWithTheme(<LandingWithLogin />);

    await userEvent.click(screen.getByRole("button", { name: /^login$/i }));

    expect(await screen.findByRole("dialog", { name: /follower sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^username$/i)).toHaveAttribute("name", "username");
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute("autocomplete", "current-password");
  });

  it("switches to traveler sign in", async () => {
    renderWithTheme(
      <LoginModal open onOpenChange={() => {}} onSignIn={() => {}} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /sign in as traveler/i }));

    expect(screen.getByRole("dialog", { name: /traveler sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/traveler code/i)).toHaveAttribute("autocomplete", "one-time-code");
    expect(screen.getByLabelText(/traveler code/i)).toHaveAttribute("name", "traveler-code");
  });

  it("can render the traveler view directly for review", () => {
    renderWithTheme(
      <LoginModal open initialView="traveler" onOpenChange={() => {}} onSignIn={() => {}} />,
    );

    expect(screen.getByRole("dialog", { name: /traveler sign in/i })).toBeInTheDocument();
  });

  it("closes when Escape is pressed", async () => {
    renderWithTheme(<LandingWithLogin />);

    await userEvent.click(screen.getByRole("button", { name: /^login$/i }));
    expect(await screen.findByRole("dialog", { name: /follower sign in/i })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});

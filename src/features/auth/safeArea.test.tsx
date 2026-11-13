import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import AuthShell from "./AuthShell";
import InviteRedemptionScreen from "./InviteRedemptionScreen";
import LandingPage from "./LandingPage";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

// jsdom cannot evaluate env(), so these assert the inset is in the class.
describe("signed-out safe-area insets", () => {
  beforeEach(() => {
    vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn() as any);
    vi.mocked(convexReact.useQuery).mockReturnValue({ status: "valid" } as any);
  });

  it("LandingPage header pads by the top inset and keeps a 3.5rem content row", () => {
    const { container } = render(<LandingPage onLoginClick={vi.fn()} />);
    const header = container.querySelector("header")!;
    expect(header.className).toContain("pt-[env(safe-area-inset-top,0px)]");
    expect(header.className).toContain("h-[calc(3.5rem+env(safe-area-inset-top,0px))]");
    expect(header.className).not.toMatch(/(^|\s)h-14(\s|$)/);
    expect(container.querySelector("section")!.className).toContain(
      "pt-[calc(5rem+env(safe-area-inset-top,0px))]",
    );
  });

  it("AuthShell keeps its content clear of the status bar and home indicator", () => {
    const { container } = render(<AuthShell title="Hi">body</AuthShell>);
    const root = container.firstElementChild!;
    expect(root.className).toContain("pt-[calc(2rem+env(safe-area-inset-top,0px))]");
    expect(root.className).toContain("pb-[calc(2rem+env(safe-area-inset-bottom,0px))]");
  });

  it("InviteRedemptionScreen hero keeps its content below the status bar", () => {
    const { container } = render(
      <InviteRedemptionScreen inviteToken="t" onSignIn={vi.fn()} onBack={vi.fn()} />,
    );
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    expect(container.querySelector("section")!.className).toContain(
      "pt-[calc(1.5rem+env(safe-area-inset-top,0px))]",
    );
  });
});

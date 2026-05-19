import type { HTMLAttributes, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import ChallengePanel from "./ChallengePanel";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

type SheetProps = {
  children?: ReactNode;
  disablePointerDismissal?: boolean;
  modal?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
};

vi.mock("../../components/ui/sheet", () => ({
  Sheet: ({ children, disablePointerDismissal, modal, onOpenChange, open }: SheetProps) => {
    if (!open) return null;

    return (
      <div
        data-testid="sheet-root"
        data-disable-pointer-dismissal={String(Boolean(disablePointerDismissal))}
        data-modal={String(Boolean(modal))}
      >
        <button type="button" onClick={() => onOpenChange?.(false)}>
          Dismiss sheet
        </button>
        {children}
      </div>
    );
  },
  SheetContent: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  SheetHeader: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  SheetTitle: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props}>{children}</h2>
  ),
  SheetBody: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  SheetGrabber: () => <div data-testid="sheet-grabber" />,
  SheetKicker: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  SheetBackButton: ({ children, ...props }: HTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children ?? "Back"}</button>
  ),
  SheetCloseButton: ({ children, ...props }: HTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children ?? "Close"}</button>
  ),
  SheetTabs: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
    <div role="tablist" {...props}>{children}</div>
  ),
  SheetTab: ({ children, active: _active, ...props }: HTMLAttributes<HTMLButtonElement> & { active?: boolean }) => (
    <button type="button" role="tab" aria-selected={Boolean(_active)} {...props}>
      {children}
    </button>
  ),
}));

function renderPanel(overrides: Partial<Parameters<typeof ChallengePanel>[0]> = {}) {
  const props = {
    open: true,
    token: "test-token",
    role: "traveler" as const,
    onClose: vi.fn(),
    ...overrides,
  };

  render(<ChallengePanel {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(convexReact.useQuery).mockReturnValue([] as any);

  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn().mockResolvedValue(null) as any);
});

describe("ChallengePanel coordinate picking", () => {
  it("ignores sheet close requests while the map is collecting a challenge coordinate", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel({ isPickingCoordinate: true });

    expect(screen.getByTestId("sheet-root")).toHaveAttribute(
      "data-disable-pointer-dismissal",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Dismiss sheet" }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes normally when coordinate picking is not active", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();

    expect(screen.getByTestId("sheet-root")).toHaveAttribute(
      "data-disable-pointer-dismissal",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Dismiss sheet" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ChallengePanel sheet layout", () => {
  it("keeps the list body scrollable inside a clipped sheet content area", () => {
    renderPanel();

    const sheet = document.querySelector('[data-role="missions-sheet"]');
    expect(sheet).not.toBeNull();
    expect(
      Array.from(sheet?.querySelectorAll("div") ?? []).some((el) =>
        el.className.includes("overflow-hidden"),
      ),
    ).toBe(true);

    expect(screen.getByRole("tabpanel")).toHaveClass("min-h-0", "space-y-2");
  });

  it("keeps the create view in a flexing sheet body", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Create mission" }));

    const titleInput = screen.getByPlaceholderText("Mission title");
    const createBody = titleInput.closest("div.flex-1");

    expect(createBody).toHaveClass("flex", "min-h-0", "flex-col");
  });
});

describe("ChallengePanel Support Crew ownership", () => {
  it("lets Support Crew withdraw a mission opened from Mine even when userId is not available", async () => {
    const user = userEvent.setup();
    const ownChallenge = {
      _id: "challenge-1",
      _creationTime: 1,
      title: "My mission",
      status: "proposed",
      source: "support_crew",
      proposedByUserId: "account-user-1",
      createdAt: 1,
      updatedAt: 1,
      createdBySessionId: "session-1",
      updatedBySessionId: "session-1",
    };
    (vi.mocked(convexReact.useQuery) as any).mockImplementation((_ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      return { mine: [ownChallenge], public: [] };
    });

    renderPanel({ role: "support_crew" });

    await user.click(screen.getByRole("tab", { name: /Mine/ }));
    await user.click(screen.getByText("My mission"));

    expect(screen.getByRole("button", { name: "Withdraw proposal" })).toBeInTheDocument();
  });
});

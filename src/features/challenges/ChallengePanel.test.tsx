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

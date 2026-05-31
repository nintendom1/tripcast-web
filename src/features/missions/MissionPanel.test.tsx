import type { HTMLAttributes, ReactNode } from "react";
import { act } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import MissionPanel from "./MissionPanel";
import { tripcastApi } from "../../convex/tripcastApi";

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

function renderPanel(overrides: Partial<Parameters<typeof MissionPanel>[0]> = {}) {
  const props = {
    open: true,
    token: "test-token",
    role: "traveler" as const,
    onClose: vi.fn(),
    ...overrides,
  };

  render(<MissionPanel {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(convexReact.useQuery).mockReturnValue([] as any);

  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn().mockResolvedValue(null) as any);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MissionPanel coordinate picking", () => {
  it("ignores sheet close requests while the map is collecting a Mission coordinate", async () => {
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

describe("MissionPanel sheet layout", () => {
  it("keeps the list body scrollable inside a clipped sheet content area", () => {
    renderPanel();

    const sheet = document.querySelector('[data-role="missions-sheet"]');
    expect(sheet).not.toBeNull();
    expect(
      Array.from(sheet?.querySelectorAll("div") ?? []).some((el) =>
        el.className.includes("overflow-hidden"),
      ),
    ).toBe(true);

    const listBody = Array.from(sheet?.querySelectorAll("div") ?? []).find((el) =>
      el.className.includes("space-y-2"),
    );
    expect(listBody).toHaveClass("min-h-0", "space-y-2");
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

describe("MissionPanel prefilled coordinates", () => {
  it("jumps to create view when opened with a prefilled coordinate", () => {
    renderPanel({
      open: true,
      prefilledCoordinate: { lat: 10, lon: 20 },
      onRequestCoordinatePick: vi.fn(),
    });

    // Verify we are in the create view (TravelerCreateForm is rendered)
    expect(screen.getByPlaceholderText("Mission title")).toBeInTheDocument();
    expect(screen.getByText(/10/)).toBeInTheDocument(); // Lat field
  });

  it("calls onClearPrefill when the panel closes", () => {
    const onClearPrefill = vi.fn();
    const { rerender } = render(
      <MissionPanel open={true} token="test" role="traveler" onClose={vi.fn()} onClearPrefill={onClearPrefill} />
    );

    expect(onClearPrefill).not.toHaveBeenCalled();

    rerender(
      <MissionPanel open={false} token="test" role="traveler" onClose={vi.fn()} onClearPrefill={onClearPrefill} />
    );

    expect(onClearPrefill).toHaveBeenCalled();
  });
});

describe("MissionPanel pending mission highlight", () => {
  it("scrolls to the pending traveler mission and clears its highlight", () => {
    vi.useFakeTimers();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const Mission = {
      _id: "Mission-1",
      _creationTime: 1,
      title: "Pinned mission",
      status: "visible",
      source: "traveler",
      createdAt: 1,
      updatedAt: 1,
      createdBySessionId: "session-1",
      updatedBySessionId: "session-1",
      lat: 47.6,
      lon: -122.3,
    };
    const Missions = [Mission];
    (vi.mocked(convexReact.useQuery) as any).mockImplementation((_ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      return Missions;
    });
    const onClearPendingMission = vi.fn();
    const onRequestNavigateToMission = vi.fn();

    renderPanel({
      pendingOpenMissionId: "Mission-1",
      onClearPendingMission,
      onRequestNavigateToMission,
    });
    const getCard = () => document.querySelector('[data-mission-id="Mission-1"]');

    expect(onRequestNavigateToMission).toHaveBeenCalledWith({ lat: 47.6, lon: -122.3 });
    expect(onClearPendingMission).toHaveBeenCalledTimes(1);
    expect(getCard()).not.toHaveClass("ring-2");

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(scrollIntoView).toHaveBeenCalled();
    expect(getCard()).toHaveClass("ring-2");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(getCard()).not.toHaveClass("ring-2");
  });
});

describe("MissionPanel mystery pin navigation", () => {
  it("navigates straight to the linked Mission's detail view when a mystery pin id is pending", async () => {
    const linkedMission = {
      _id: "ch-mystery-1",
      _creationTime: 1,
      title: "ReD PAth",
      status: "visible",
      source: "mystery",
      sourceMysteryMissionId: "mm-1",
      lat: 34.9671,
      lon: 135.7727,
      createdAt: 1,
      updatedAt: 1,
    };
    const mystery = {
      _id: "mm-1",
      mysteryMissionId: "kyoto-fushimi-001",
      state: "signal",
      mysteryText: "ReD PAth",
      region: "Kyoto",
      linkedMissionId: "ch-mystery-1",
    };
    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      if (ref === tripcastApi.mysteryMissions.getMysteryMission) return mystery;
      if (ref === tripcastApi.missions.getMission) return linkedMission;
      if (ref === tripcastApi.missions.travelerListMissions) return [linkedMission];
      if (ref === tripcastApi.journalEvents.listJournalEvents) return [];
      return undefined;
    });
    const onClearPendingMysteryMission = vi.fn();

    renderPanel({
      pendingOpenMysteryMissionId: "mm-1",
      onClearPendingMysteryMission,
    });

    // Detail view renders the RadioTower chip for the mystery (not the list view).
    expect(await screen.findByText("Unknown Signal")).toBeInTheDocument();
    expect(screen.getByText("Next steps")).toBeInTheDocument();
    expect(onClearPendingMysteryMission).toHaveBeenCalledTimes(1);
  });

  it("falls back to list view when the mystery has no linkedMissionId", async () => {
    const orphanMystery = {
      _id: "mm-2",
      mysteryMissionId: "no-link-001",
      state: "signal",
      mysteryText: "OrphAn",
      linkedMissionId: undefined,
    };
    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      if (ref === tripcastApi.mysteryMissions.getMysteryMission) return orphanMystery;
      if (ref === tripcastApi.missions.travelerListMissions) return [];
      return undefined;
    });
    const onClearPendingMysteryMission = vi.fn();

    renderPanel({
      pendingOpenMysteryMissionId: "mm-2",
      onClearPendingMysteryMission,
    });

    // No detail view section labels — empty list message renders instead.
    expect(screen.queryByText("Next steps")).not.toBeInTheDocument();
    expect(onClearPendingMysteryMission).toHaveBeenCalledTimes(1);
  });
});

describe("MissionPanel Follower ownership", () => {
  it("lets a Follower withdraw a mission opened from Mine even when userId is not available", async () => {
    const user = userEvent.setup();
    const ownMission = {
      _id: "Mission-1",
      _creationTime: 1,
      title: "My mission",
      status: "proposed",
      source: "follower",
      proposedByUserId: "account-user-1",
      createdAt: 1,
      updatedAt: 1,
      createdBySessionId: "session-1",
      updatedBySessionId: "session-1",
    };
    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      if (ref === tripcastApi.journalEvents.listJournalEvents) return [];
      if (ref === tripcastApi.missions.getMission) return ownMission;
      return { mine: [ownMission], public: [] };
    });

    renderPanel({ role: "follower" });

    await user.click(screen.getByRole("tab", { name: /Mine/ }));
    await user.click(screen.getByText("My mission"));

    expect(screen.getByRole("button", { name: "Withdraw proposal" })).toBeInTheDocument();
  });
});

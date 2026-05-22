import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { BadgeAwardContext } from "../../convex/tripcastApi";
import AwardBadgeSheet from "./AwardBadgeSheet";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

// Sheet primitives are body-portal overlays — stub them to plain wrappers.
vi.mock("../../components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetCloseButton: () => <button type="button">CloseX</button>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

const BADGES: BadgeAwardContext["badges"] = [
  { badgeType: "tasty", name: "Tasty", emoji: "🍜", description: "food" },
  { badgeType: "life_changing", name: "Life Changing", emoji: "✨", description: "big" },
];

function setup({
  context,
  award = vi.fn().mockResolvedValue({
    awardedCount: 1,
    alreadyAwardedCount: 0,
    skippedNotAttributedCount: 0,
  }),
}: {
  context: BadgeAwardContext | undefined;
  award?: ReturnType<typeof vi.fn>;
}) {
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) =>
    ref === tripcastApi.badges.travelerGetBadgeAwardContext ? context : undefined,
  );
  vi.mocked(convexReact.useMutation).mockImplementation((ref: unknown) =>
    ref === tripcastApi.badges.travelerAwardBadges ? (award as any) : (vi.fn() as any),
  );
  return { award };
}

function ctx(overrides: Partial<BadgeAwardContext> = {}): BadgeAwardContext {
  return {
    sourceLabel: "Mission: Ramen stop",
    recipients: [
      {
        idTag: "alex-id",
        userId: "alex-id",
        devSessionId: null,
        displayName: "Alex",
        isDev: false,
        hiddenAttribution: false,
      },
    ],
    badges: BADGES,
    awarded: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

const props = {
  open: true,
  token: "t",
  sourceType: "mission" as const,
  sourceId: "m1",
  onOpenChange: () => {},
};

describe("AwardBadgeSheet", () => {
  it("shows an empty state when there are no attributed Followers", () => {
    setup({ context: ctx({ recipients: [] }) });
    render(<AwardBadgeSheet {...props} />);
    expect(screen.getByText("No attributed Followers yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Award Badge" })).not.toBeInTheDocument();
  });

  it("awards the selected badge to the default-selected recipients", async () => {
    const { award } = setup({ context: ctx() });
    render(<AwardBadgeSheet {...props} />);

    // Recipient defaults to checked; pick a badge then confirm.
    await userEvent.click(screen.getByRole("button", { name: /Tasty/ }));
    await userEvent.click(screen.getByRole("button", { name: "Award Badge" }));

    await waitFor(() => {
      expect(award).toHaveBeenCalledWith({
        token: "t",
        sourceType: "mission",
        sourceId: "m1",
        badgeType: "tasty",
        recipients: [{ userId: "alex-id" }],
        note: undefined,
      });
    });
  });

  it("blocks awarding a badge a recipient already earned for this source", async () => {
    const { award } = setup({
      context: ctx({ awarded: [{ idTag: "alex-id", badgeType: "tasty" }] }),
    });
    render(<AwardBadgeSheet {...props} />);

    await userEvent.click(screen.getByRole("button", { name: /Tasty/ }));
    expect(screen.getByText("Already awarded")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Award Badge" }));
    expect(
      screen.getByText(/hasn't already earned this badge/i),
    ).toBeInTheDocument();
    expect(award).not.toHaveBeenCalled();
  });
});

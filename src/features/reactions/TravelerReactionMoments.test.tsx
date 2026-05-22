import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { Reaction } from "../../convex/tripcastApi";
import TravelerReactionMoments from "./TravelerReactionMoments";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

const reaction: Reaction = {
  _id: "r1",
  emoji: "🔥",
  reactorName: "Robin",
  targetKind: "activity",
  createdAt: 1,
};

let markSeen: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  markSeen = vi.fn().mockResolvedValue(null);
  vi.mocked(convexReact.useMutation).mockReturnValue(markSeen as never);
});

describe("TravelerReactionMoments", () => {
  it("shows a moment for an unseen reaction and marks it seen", async () => {
    (vi.mocked(convexReact.useQuery) as never as ReturnType<typeof vi.fn>).mockImplementation(
      (ref: unknown) =>
        ref === tripcastApi.reactions.travelerListUnseenReactions ? [reaction] : undefined,
    );

    render(<TravelerReactionMoments token="t" />);

    await waitFor(() =>
      expect(markSeen).toHaveBeenCalledWith({ token: "t", ids: ["r1"] }),
    );
    await waitFor(() =>
      expect(screen.getByText("Robin reacted")).toBeInTheDocument(),
    );
  });

  it("renders nothing when there are no reactions", () => {
    (vi.mocked(convexReact.useQuery) as never as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const { container } = render(<TravelerReactionMoments token="t" />);
    expect(container).toBeEmptyDOMElement();
  });
});

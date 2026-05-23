import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import BulkImportSheet from "./BulkImportSheet";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("../../providers/MusicProvider", () => ({
  useMusicSafe: () => ({
    sfx: vi.fn(),
  }),
}));

vi.mock("../../debug/useActiveUiContext", () => ({
  useActiveUiContext: vi.fn(),
}));

vi.mock("../../debug/useDebugLogger", () => ({
  useDebugLogger: vi.fn(() => ({
    logUi: vi.fn(),
  })),
}));

const validPreview = {
  valid: true,
  maxEntries: 50,
  counts: { checkins: 1, transactions: 1, missions: 0, routeVotes: 0 },
  rows: [
    { index: 0, kind: "story", ref: "story:one", title: "Story one", links: [] },
    { index: 1, kind: "transaction", ref: "tx:one", title: "Coffee", detail: "USD 4", links: ["Links to story:one"] },
  ],
  errors: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(convexReact.useQuery).mockImplementation((...args: any[]) => {
    return args[1] === "skip" ? undefined : validPreview;
  });
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn().mockResolvedValue({
    imported: 2,
    counts: { checkins: 1, transactions: 1, missions: 0, routeVotes: 0 },
    idsByRef: { "story:one": "a", "tx:one": "b" },
  }) as any);
});

describe("BulkImportSheet", () => {
  it("starts with an empty input", () => {
    render(<BulkImportSheet open token="test-token" onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText(/bulk import json/i)).toHaveValue("");
  });

  it("shows a local parse error before preview", async () => {
    render(
      <BulkImportSheet open token="test-token" onOpenChange={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText(/bulk import json/i), {
      target: { value: "{bad json" },
    });
    await userEvent.click(screen.getByRole("button", { name: /validate & preview/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/json/i);
  });

  it("previews and commits valid imported entries", async () => {
    const onImported = vi.fn();
    const commit = vi.fn().mockResolvedValue({
      imported: 2,
      counts: { checkins: 1, transactions: 1, missions: 0, routeVotes: 0 },
      idsByRef: { "story:one": "a", "tx:one": "b" },
    });
    vi.mocked(convexReact.useMutation).mockReturnValue(commit as any);

    render(
      <BulkImportSheet open token="test-token" onOpenChange={vi.fn()} onImported={onImported} />,
    );

    fireEvent.change(screen.getByLabelText(/bulk import json/i), {
      target: {
        value: JSON.stringify({
          timeZone: "Asia/Tokyo",
          entries: [
            {
              kind: "story",
              ref: "story:one",
              timeZone: "Asia/Tokyo",
              title: "Story one",
              body: "Hello",
              lat: 1,
              lon: 1,
              occurredAt: "2026-05-18",
            },
            {
              kind: "transaction",
              ref: "tx:one",
              timeZone: "Asia/Tokyo",
              title: "Coffee",
              localAmount: 4,
              linkedToRef: "story:one",
              occurredAt: "2026-05-18T09:30:00+09:00",
            },
          ],
        }),
      },
    });

    await userEvent.click(screen.getByRole("button", { name: /validate & preview/i }));
    expect(screen.getByText("Story one")).toBeInTheDocument();
    expect(screen.getByText(/links to story:one/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /commit 2 entries/i }));

    await waitFor(() => {
      expect(commit).toHaveBeenCalledWith(expect.objectContaining({
        token: "test-token",
        entries: expect.objectContaining({ timeZone: "Asia/Tokyo" }),
      }));
      expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ imported: 2 }));
    });
    expect(screen.getByText(/2 entries imported/i)).toBeInTheDocument();
  });

  it("inserts sample JSON when 'Insert Sample' is clicked", async () => {
    const user = userEvent.setup();
    render(<BulkImportSheet open token="test-token" onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /insert sample/i }));

    const textarea = screen.getByLabelText(/bulk import json/i) as HTMLTextAreaElement;
    expect(textarea.value).not.toBe("");
    expect(textarea.value).toContain("America/Los_Angeles");
    expect(textarea.value).toContain("entries");
  });

  it("copies the schema to clipboard and shows feedback", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<BulkImportSheet open token="test-token" onOpenChange={vi.fn()} />);

    const copyBtn = screen.getByRole("button", { name: /copy schema/i });
    await user.click(copyBtn);

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("TripCast Bulk Import"));
    expect(screen.getByText("Copied!")).toBeInTheDocument();
  });
});

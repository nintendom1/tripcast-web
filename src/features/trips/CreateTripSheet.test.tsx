import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TripCard } from "../../convex/tripcastApi";
import { ThemeProvider } from "../../providers/ThemeProvider";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { CreateTripSheet } from "./CreateTripSheet";
import { dateInputToMs, msToDateInput, TRIP_TITLE_MAX } from "./EditTripSheet";

const server = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  create: (() => Promise.resolve({ tripId: "new-trip" })) as (args: Record<string, unknown>) => Promise<unknown>,
  cards: [] as unknown[],
  status: "Exhausted" as string,
  listArgs: [] as unknown[],
  loadMore: vi.fn(),
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: (ref: never) => (args: Record<string, unknown>) => {
      server.calls.push({ name: getFunctionName(ref), args });
      return server.create(args);
    },
    usePaginatedQuery: (_ref: unknown, args: unknown) => {
      server.listArgs.push(args);
      return { results: server.cards, status: server.status, loadMore: server.loadMore };
    },
  };
});

const makeCard = (id: string, title: string): TripCard => ({
  tripId: id,
  title,
  lifecycle: "completed",
  isLegacy: false,
  isCurrent: false,
  revision: 1,
  updatedAt: 0,
  previewStatus: "ready",
  previewVersion: 1,
  storyCount: 0,
  missionCount: 0,
  routeVoteCount: 0,
});

function Opener({ onCreated, onClose }: { onCreated: (id: string) => void; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen(true)}>
        Open create
      </button>
      {open ? (
        <CreateTripSheet
          returnFocusRef={ref}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          onCreated={(id) => {
            onCreated(id);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

async function setup() {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(
    <ThemeProvider>
      <TripContextTestProvider value={{ multiTripEnabled: true, token: "tok" }}>
        <Opener onCreated={onCreated} onClose={onClose} />
      </TripContextTestProvider>
    </ThemeProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Open create" }));
  await screen.findByRole("dialog");
  return { user, onCreated, onClose };
}

const submit = () => screen.getByRole("button", { name: "Create trip" });

beforeEach(() => {
  server.calls = [];
  server.cards = [];
  server.status = "Exhausted";
  server.listArgs = [];
  server.loadMore.mockReset();
  server.create = () => Promise.resolve({ tripId: "new-trip" });
});
afterEach(() => {
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

describe("CreateTripSheet", () => {
  it("focuses the title, shows the copy picker with Defaults selected, and the helper text", async () => {
    server.cards = [makeCard("summer", "Summer 2026")];
    await setup();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus());
    const select = screen.getByRole("combobox", { name: "Copy settings from" });
    expect(select).toHaveValue("defaults");
    expect(screen.getByRole("option", { name: "Defaults" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Summer 2026" })).toBeInTheDocument();
    expect(screen.getByText("Copies settings only. Stories, expenses and budget amounts are never copied.")).toBeInTheDocument();
  });

  it("reaches trips beyond the first page: search narrows the list and Load more fetches the next page", async () => {
    server.cards = [makeCard("a", "Alpha")];
    server.status = "CanLoadMore";
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "Load more trips" }));
    expect(server.loadMore).toHaveBeenCalledWith(20);
    await user.type(screen.getByRole("searchbox", { name: "Search trips to copy from" }), "zed");
    await waitFor(() => expect(server.listArgs.at(-1)).toMatchObject({ search: "zed" }));
  });

  it("keeps the chosen source selected when a search no longer lists it, and sends it", async () => {
    server.cards = [makeCard("a", "Alpha")];
    const { user } = await setup();
    await user.selectOptions(screen.getByRole("combobox", { name: "Copy settings from" }), "a");
    server.cards = [makeCard("z", "Zulu")];
    await user.type(screen.getByRole("searchbox", { name: "Search trips to copy from" }), "z");
    await waitFor(() => expect(screen.getByRole("option", { name: "Zulu" })).toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: "Copy settings from" })).toHaveValue("a");
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Winter");
    await user.click(submit());
    await waitFor(() => expect(server.calls).toHaveLength(1));
    expect(server.calls[0].args.copySettingsFrom).toBe("a");
  });

  it("does not offer trips that are being deleted", async () => {
    server.cards = [makeCard("a", "Alpha"), { ...makeCard("b", "Going away"), deletingAt: 1 }];
    await setup();
    expect(screen.getByRole("option", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Going away" })).not.toBeInTheDocument();
  });

  it("requires a title and calls nothing", async () => {
    const { user } = await setup();
    await user.click(submit());
    expect(screen.getByRole("alert")).toHaveTextContent("Title is required.");
    await user.type(screen.getByRole("textbox", { name: "Title" }), "   ");
    await user.click(submit());
    expect(screen.getByRole("alert")).toHaveTextContent("Title is required.");
    expect(server.calls).toHaveLength(0);
  });

  it("accepts exactly 80 characters and refuses 81", async () => {
    const { user } = await setup();
    const title = screen.getByRole("textbox", { name: "Title" });
    await user.type(title, "x".repeat(TRIP_TITLE_MAX + 1));
    await user.click(submit());
    expect(screen.getByRole("alert")).toHaveTextContent("Title must be 80 characters or fewer.");
    expect(server.calls).toHaveLength(0);
    await user.type(title, "{Backspace}");
    await user.click(submit());
    await waitFor(() => expect(server.calls).toHaveLength(1));
  });

  it("refuses an end before the start", async () => {
    const { user } = await setup();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Winter");
    await user.type(screen.getByLabelText("Planned start"), "2026-12-10");
    await user.type(screen.getByLabelText("Planned end"), "2026-12-01");
    await user.click(submit());
    expect(screen.getByRole("alert")).toHaveTextContent("The planned end cannot be before the planned start.");
    expect(server.calls).toHaveLength(0);
  });

  it("creates with Defaults and hands back the new trip id", async () => {
    const { user, onCreated } = await setup();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "  Winter 2026 ");
    await user.type(screen.getByRole("textbox", { name: "Destinations" }), "Oslo, Bergen");
    await user.type(screen.getByLabelText("Planned start"), "2026-12-01");
    await user.type(screen.getByLabelText("Planned end"), "2026-12-10");
    await user.click(submit());
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("new-trip"));
    expect(server.calls).toEqual([
      {
        name: "trips:createTrip",
        args: {
          token: "tok",
          title: "Winter 2026",
          destinationSummary: "Oslo, Bergen",
          plannedStartAt: dateInputToMs("2026-12-01"),
          plannedEndAt: dateInputToMs("2026-12-10"),
          copySettingsFrom: "defaults",
        },
      },
    ]);
  });

  it("copies settings from the chosen trip and omits blank optional fields", async () => {
    server.cards = [makeCard("summer", "Summer 2026")];
    const { user } = await setup();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Winter");
    await user.selectOptions(screen.getByRole("combobox", { name: "Copy settings from" }), "summer");
    await user.click(submit());
    await waitFor(() => expect(server.calls).toHaveLength(1));
    expect(server.calls[0].args).toEqual({ token: "tok", title: "Winter", copySettingsFrom: "summer" });
  });

  it("waits for the server: no created callback and a disabled button while saving", async () => {
    let resolve: (value: unknown) => void = () => {};
    server.create = () => new Promise((r) => (resolve = r));
    const { user, onCreated } = await setup();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Winter");
    await user.click(submit());
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
    expect(onCreated).not.toHaveBeenCalled();
    resolve({ tripId: "t9" });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("t9"));
  });

  it("shows the server's message and stays open", async () => {
    server.create = () => Promise.reject(new ConvexError("Too many trip changes. Try again later."));
    const { user, onCreated } = await setup();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Winter");
    await user.click(submit());
    expect(await screen.findByText("Too many trip changes. Try again later.")).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
    expect(submit()).toBeEnabled();
  });

  it("is disabled while offline", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    await setup();
    expect(screen.getByText("You're offline.")).toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  it("Escape cancels and focus returns to the opener", async () => {
    const { user, onClose } = await setup();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Open create" })).toHaveFocus());
    expect(server.calls).toHaveLength(0);
  });
});

describe("date helpers", () => {
  it("round-trips a local date and rejects blanks", () => {
    expect(msToDateInput(dateInputToMs("2026-03-09"))).toBe("2026-03-09");
    expect(dateInputToMs("")).toBeUndefined();
    expect(msToDateInput(undefined)).toBe("");
  });
});

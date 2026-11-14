import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import StoryDetailSheet from "./StoryDetailSheet";
import { ReadingSpeedProvider } from "../../providers/ReadingSpeedProvider";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { tripcastApi, type CurrentTrip, type JournalEvent } from "../../convex/tripcastApi";
import { resetActiveUiContextForTests } from "../../debug/activeUiContext";
import type { TripContextValue } from "../trips/tripTypes";

vi.mock("convex/react", () => ({
  useConvex: vi.fn(() => ({ query: vi.fn(), mutation: vi.fn(), action: vi.fn() })),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: { div: "div", img: "img" },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const SHARED = "trip-shared";
const current = (): CurrentTrip => ({
  tripId: SHARED,
  title: "Shared Trip",
  lifecycle: "in_progress",
  isLegacy: false,
  revision: 1,
  publishingEpoch: 1,
  epochStartedAt: 1,
  multiTripEnabled: true,
});

/** A Traveler viewing `id` privately; the shared current trip is `SHARED`. */
const privateView = (id: string): Partial<TripContextValue> => ({
  role: "traveler",
  multiTripEnabled: true,
  currentTrip: current(),
  viewingMode: "private",
  viewingTripId: id,
  viewingTrip: { tripId: id, title: `Trip ${id}` },
});

/** The same Traveler after "Return to current": following the shared trip. */
const followingCurrent: Partial<TripContextValue> = {
  role: "traveler",
  multiTripEnabled: true,
  currentTrip: current(),
  viewingMode: "follow_current",
  viewingTripId: SHARED,
  viewingTrip: { tripId: SHARED, title: "Shared Trip" },
};

function story(id: string, checkpointId: string): JournalEvent {
  return {
    _id: id,
    _creationTime: 1000,
    type: "story",
    narrativeLevel: "narrative",
    occurredAt: Date.UTC(2026, 4, 16, 14, 32),
    createdAt: 1,
    title: `Story ${id}`,
    body: "Body text",
    checkpointId,
  } as JournalEvent;
}

const updateSpy = vi.fn();
const deleteSpy = vi.fn();

function sheet(view: Partial<TripContextValue> | undefined, event: JournalEvent) {
  const content = (
    <ReadingSpeedProvider>
      <StoryDetailSheet event={event} token="t" role="traveler" onClose={vi.fn()} onLocationFocus={vi.fn()} />
    </ReadingSpeedProvider>
  );
  return view ? <TripContextTestProvider value={view}>{content}</TripContextTestProvider> : content;
}

const edit = () => fireEvent.click(screen.getByRole("button", { name: "Edit" }));
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

beforeEach(() => {
  resetActiveUiContextForTests();
  updateSpy.mockReset().mockResolvedValue(undefined);
  deleteSpy.mockReset().mockResolvedValue(undefined);
  (vi.mocked(useMutation) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.checkpoints.updateCheckpoint) return updateSpy;
    if (ref === tripcastApi.checkpoints.deleteCheckpoint) return deleteSpy;
    return vi.fn().mockResolvedValue(undefined);
  });
  (vi.mocked(useQuery) as any).mockReturnValue(undefined);
  window.localStorage.setItem("tripcast.story.readingSpeed", "instant");
});

afterEach(() => {
  window.localStorage.clear();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useQuery).mockReset();
});

describe("StoryDetailSheet pins its writes to the trip shown when the editor opens", () => {
  it("saves to the trip shown after the view changed while the sheet was open", async () => {
    const event = story("s1", "cp1");
    const { rerender } = render(sheet(privateView("A"), event));
    rerender(sheet(privateView("B"), event));
    edit();

    expect(screen.getByTestId("trip-target-label").textContent).toBe("Trip B");
    save();
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ checkpointId: "cp1", tripId: "B" }));
  });

  it("deletes from the trip shown, and names it in the confirmation", async () => {
    const event = story("s1", "cp1");
    const { rerender } = render(sheet(privateView("A"), event));
    rerender(sheet(privateView("B"), event));
    edit();
    fireEvent.click(screen.getByRole("button", { name: "Delete Story" }));

    expect(screen.getByText("Delete this Story from Trip B?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledTimes(1));
    expect(deleteSpy).toHaveBeenCalledWith({ token: "t", checkpointId: "cp1", tripId: "B" });
  });

  it("names the trip after Return to current, because the delete still goes there; Save stays on it too", async () => {
    const event = story("s1", "cp1");
    const { rerender } = render(sheet(privateView("B"), event));
    edit();
    rerender(sheet(followingCurrent, event)); // Return to current while the editor is open
    fireEvent.click(screen.getByRole("button", { name: "Delete Story" }));

    // Decided from the delete's trip (B) against the shared current trip, not from the viewing mode.
    expect(screen.getByText("Delete this Story from Trip B?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    save(); // opening Delete did not re-pin the edit
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ tripId: "B" }));
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("does not name the trip when the delete goes to the shared current trip, even in a private view of it", () => {
    const event = story("s1", "cp1");
    render(sheet({ ...privateView(SHARED), viewingTrip: { tripId: SHARED, title: "Shared Trip" } }, event));
    edit();
    fireEvent.click(screen.getByRole("button", { name: "Delete Story" }));
    expect(screen.getByText("Delete this Story?")).toBeInTheDocument();
  });

  it("pins again when the sheet is reused for another Story without closing", async () => {
    const { rerender } = render(sheet(privateView("A"), story("s1", "cp1")));
    edit();
    rerender(sheet(privateView("B"), story("s2", "cp2")));
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument());
    edit();
    save();
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ checkpointId: "cp2", tripId: "B" }));
  });

  it("with no provider the delete title and the arguments are today's", async () => {
    const event = story("s1", "cp1");
    render(sheet(undefined, event));
    edit();
    fireEvent.click(screen.getByRole("button", { name: "Delete Story" }));
    expect(screen.getByText("Delete this Story?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledTimes(1));
    expect(deleteSpy.mock.calls[0][0]).toEqual({ token: "t", checkpointId: "cp1" });
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import CreateRouteVoteForm from "./CreateRouteVoteForm";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const createVote = vi.fn();
const form = (
  <CreateRouteVoteForm token="t" onCreated={vi.fn()} onCancel={vi.fn()} onRequestCoordinatePick={vi.fn()} referenceLocation={null} />
);

beforeEach(() => {
  vi.clearAllMocks();
  createVote.mockResolvedValue("new-vote");
  vi.mocked(convexReact.useMutation).mockReturnValue(createVote as never);
  vi.mocked(convexReact.useQuery).mockReturnValue(undefined as never);
});

async function submit() {
  const titles = screen.getAllByPlaceholderText("Option title");
  await userEvent.type(titles[0], "Cafe");
  await userEvent.type(titles[1], "Museum");
  await userEvent.click(screen.getByRole("button", { name: "Propose Route Vote" }));
}

describe("CreateRouteVoteForm with a viewed trip", () => {
  it("writes to the trip captured when the form opened and names it in private view", async () => {
    const { rerender } = render(<TripContextTestProvider value={travelerViewingPrivately}>{form}</TripContextTestProvider>);
    expect(screen.getByText("Other Trip")).toBeInTheDocument();
    rerender(<TripContextTestProvider value={travelerFollowingCurrent}>{form}</TripContextTestProvider>);
    await submit();
    await waitFor(() => expect(createVote).toHaveBeenCalledWith(expect.objectContaining({ tripId: "trip-other" })));
  });

  it("reads carry the viewed trip, and nothing is added with multi-trip disabled", async () => {
    render(<TripContextTestProvider value={travelerFollowingCurrent}>{form}</TripContextTestProvider>);
    expect(vi.mocked(convexReact.useQuery).mock.calls[0][1]).toEqual({ token: "t", tripId: "trip-current" });
    expect(screen.queryByTestId("trip-target-label")).not.toBeInTheDocument();
  });

  it("sends no trip with no provider", async () => {
    render(form);
    await submit();
    await waitFor(() => expect(createVote).toHaveBeenCalled());
    expect(createVote.mock.calls[0][0]).not.toHaveProperty("tripId");
  });
});

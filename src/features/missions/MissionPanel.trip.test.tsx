import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import MissionPanel from "./MissionPanel";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const create = vi.fn();
const panel = <MissionPanel open token="t" role="traveler" onClose={vi.fn()} />;

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue(null);
  vi.mocked(convexReact.useQuery).mockReturnValue([] as never);
  vi.mocked(convexReact.useMutation).mockReturnValue(create as never);
});

describe("MissionPanel create form with a viewed trip", () => {
  it("writes to the trip captured when the form opened and names it in private view", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TripContextTestProvider value={travelerViewingPrivately}>{panel}</TripContextTestProvider>);
    await user.click(screen.getByRole("button", { name: "Create mission" }));
    expect(screen.getByTestId("trip-target-label")).toHaveTextContent("Other Trip");
    rerender(<TripContextTestProvider value={travelerFollowingCurrent}>{panel}</TripContextTestProvider>);
    await user.type(screen.getByPlaceholderText("Mission title"), "Go");
    await user.click(screen.getByRole("button", { name: "Create mission" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ title: "Go", tripId: "trip-other" }));
  });

  it("sends no trip and shows no label with multi-trip disabled", async () => {
    const user = userEvent.setup();
    render(panel);
    await user.click(screen.getByRole("button", { name: "Create mission" }));
    expect(screen.queryByTestId("trip-target-label")).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Mission title"), "Go");
    await user.click(screen.getByRole("button", { name: "Create mission" }));
    expect(create.mock.calls[0][0]).not.toHaveProperty("tripId");
  });
});

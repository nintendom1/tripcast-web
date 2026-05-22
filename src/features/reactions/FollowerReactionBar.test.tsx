import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import FollowerReactionBar from "./FollowerReactionBar";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
}));

let submit: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  submit = vi.fn().mockResolvedValue(null);
  vi.mocked(convexReact.useMutation).mockReturnValue(submit as never);
});

describe("FollowerReactionBar", () => {
  it("submits the chosen emoji reaction to the Traveler", async () => {
    const user = userEvent.setup();
    render(<FollowerReactionBar token="t" />);

    await user.click(screen.getByRole("button", { name: "React 🔥" }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith({ token: "t", emoji: "🔥", targetKind: "activity" });
  });

  it("renders the full reaction palette", () => {
    render(<FollowerReactionBar token="t" />);
    expect(screen.getByRole("group", { name: "React to the Traveler" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "React 🎉" })).toBeInTheDocument();
  });
});

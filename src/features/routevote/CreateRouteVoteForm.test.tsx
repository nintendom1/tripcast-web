import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import type { Mission } from "../../convex/tripcastApi";
import CreateRouteVoteForm from "./CreateRouteVoteForm";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

function renderForm() {
  const createVote = vi.fn().mockResolvedValue("new-vote-id");

  vi.mocked(convexReact.useMutation).mockReturnValue(createVote as any);

  const onCreated = vi.fn();
  render(
    <CreateRouteVoteForm
      token="test-token"
      onCreated={onCreated}
      onCancel={vi.fn()}
      onRequestCoordinatePick={vi.fn()}
      referenceLocation={null}
    />,
  );

  return { createVote, onCreated };
}

async function fillRequiredOptions() {
  const optionTitles = screen.getAllByPlaceholderText("Option title");
  await userEvent.type(optionTitles[0], "Cafe");
  await userEvent.type(optionTitles[1], "Museum");
}

function getCloseInput() {
  const input = document.querySelector<HTMLInputElement>('input[type="datetime-local"]');
  expect(input).not.toBeNull();
  return input as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no linkable missions, so the Mission-link selector is hidden.
  vi.mocked(convexReact.useQuery).mockReturnValue([] as any);
  vi.spyOn(Date, "now").mockReturnValue(new Date("2026-05-13T10:00:00").getTime());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CreateRouteVoteForm", () => {
  it("defaults to the quick title and one-hour close time", async () => {
    const { createVote, onCreated } = renderForm();

    expect(screen.getByLabelText("Title")).toHaveValue("Where should I go next?");
    expect(getCloseInput()).toHaveValue("2026-05-13T11:00");

    await fillRequiredOptions();
    await userEvent.click(screen.getByRole("button", { name: "Propose Route Vote" }));

    await waitFor(() => {
      expect(createVote).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "test-token",
          title: "Where should I go next?",
          expiresAt: new Date("2026-05-13T11:00").getTime(),
        }),
      );
    });
    expect(onCreated).toHaveBeenCalledWith("new-vote-id");
  });

  it("uses the default title when the title field is cleared", async () => {
    const { createVote } = renderForm();

    await userEvent.clear(screen.getByLabelText("Title"));
    await fillRequiredOptions();
    await userEvent.click(screen.getByRole("button", { name: "Propose Route Vote" }));

    await waitFor(() => {
      expect(createVote).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Where should I go next?" }),
      );
    });
  });

  it("lets the traveler choose the 72-hour close preset", async () => {
    const { createVote } = renderForm();

    await userEvent.click(screen.getByRole("button", { name: "72 hours" }));
    expect(getCloseInput()).toHaveValue("2026-05-16T10:00");

    await fillRequiredOptions();
    await userEvent.click(screen.getByRole("button", { name: "Propose Route Vote" }));

    await waitFor(() => {
      expect(createVote).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: new Date("2026-05-16T10:00").getTime(),
        }),
      );
    });
  });

  it("collapses optional option details until expanded", async () => {
    renderForm();

    expect(screen.queryByPlaceholderText("Description (optional)")).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "More details" })[0]);

    expect(screen.getByPlaceholderText("Description (optional)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Est. cost USD")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Duration (min)")).toBeInTheDocument();
  });

  it("prefills an option from a linked Mission and submits its linkedMissionId", async () => {
    const linkableMission: Mission = {
      _id: "mission-1",
      title: "Ride the ferry",
      status: "visible",
      source: "follower",
      locationLabel: "Pier 52",
      estimatedCostUsd: 8,
      createdAt: 1,
      updatedAt: 1,
    };
    vi.mocked(convexReact.useQuery).mockReturnValue([linkableMission] as any);

    const { createVote } = renderForm();

    const linkSelects = screen.getAllByLabelText(/Link to an existing mission/i);
    await userEvent.selectOptions(linkSelects[0], "mission-1");

    const optionTitles = screen.getAllByPlaceholderText("Option title");
    expect(optionTitles[0]).toHaveValue("Ride the ferry");
    await userEvent.type(optionTitles[1], "Food crawl");

    await userEvent.click(screen.getByRole("button", { name: "Propose Route Vote" }));

    await waitFor(() => expect(createVote).toHaveBeenCalledTimes(1));
    const arg = createVote.mock.calls[0][0];
    expect(arg.options[0].linkedMissionId).toBe("mission-1");
    expect(arg.options[0].title).toBe("Ride the ferry");
    expect(arg.options[1].linkedMissionId).toBeUndefined();
  });
});

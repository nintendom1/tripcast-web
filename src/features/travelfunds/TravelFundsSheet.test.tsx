import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import TravelFundsSheet from "./TravelFundsSheet";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("../../providers/MusicProvider", () => ({
  useMusicSafe: () => ({ sfx: vi.fn() }),
}));

vi.mock("../../debug/useActiveUiContext", () => ({
  useActiveUiContext: vi.fn(),
}));

const config = {
  enabled: true,
  startingBudgetUsd: 1000,
  spentUsd: 250,
  remainingUsd: 750,
  budgetLabel: "Test trip",
};

function setup({ updateConfig = vi.fn().mockResolvedValue(null) } = {}) {
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelFunds.travelerGetConfig) return config;
    if (ref === tripcastApi.travelFunds.travelerListTransactions) return [];
    return undefined;
  });
  vi.mocked(convexReact.useMutation).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelFunds.travelerUpdateConfig) return updateConfig as any;
    return vi.fn().mockResolvedValue(null) as any;
  });
  return { updateConfig };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TravelFundsSheet settings", () => {
  it("shows a themed friendly error before saving a budget above the server limit", async () => {
    const { updateConfig } = setup();
    render(<TravelFundsSheet token="t" onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Funds settings" }));
    const settings = screen.getByText("Funds settings").closest("div")!.parentElement!;
    const budgetInput = within(settings).getByLabelText("Starting budget (USD)");

    await userEvent.clear(budgetInput);
    await userEvent.type(budgetInput, "10000001");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Starting budget must be between $0 and $10,000,000.");
    expect(alert).toHaveClass("bg-[var(--bg-danger)]");
    expect(alert).toHaveClass("text-[var(--ink-danger)]");
    expect(updateConfig).not.toHaveBeenCalled();
  });

  it("normalizes the server budget range error if Convex rejects the save", async () => {
    const updateConfig = vi
      .fn()
      .mockRejectedValue(new Error("startingBudgetUsd must be between 0 and 10000000."));
    setup({ updateConfig });
    render(<TravelFundsSheet token="t" onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Funds settings" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateConfig).toHaveBeenCalled();
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Starting budget must be between $0 and $10,000,000.",
    );
  });
});

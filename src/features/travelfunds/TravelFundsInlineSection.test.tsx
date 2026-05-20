import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as convexReact from "convex/react";

import TravelFundsInlineSection, {
  type TravelFundsInlineState,
} from "./TravelFundsInlineSection";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

type ConfigShape = { enabled: false } | {
  enabled: true;
  startingBudgetUsd: number;
  budgetLabel?: string;
  remainingUsd: number;
  spentUsd: number;
};

function mockConfig(config: ConfigShape | undefined) {
  vi.mocked(convexReact.useQuery).mockReturnValue(config);
}

function renderSection(opts?: {
  prefill?: React.ComponentProps<typeof TravelFundsInlineSection>["prefill"];
  config?: ConfigShape;
}) {
  mockConfig(
    opts?.config ?? {
      enabled: true,
      startingBudgetUsd: 100,
      remainingUsd: 100,
      spentUsd: 0,
    },
  );
  const onChange = vi.fn<(state: TravelFundsInlineState) => void>();
  render(<TravelFundsInlineSection token="t" prefill={opts?.prefill} onChange={onChange} />);
  return { onChange };
}

function lastEmitted(onChange: ReturnType<typeof vi.fn>): TravelFundsInlineState {
  if (onChange.mock.calls.length === 0) throw new Error("onChange never called");
  return onChange.mock.calls[onChange.mock.calls.length - 1][0];
}

describe("TravelFundsInlineSection — initial state", () => {
  it("returns null when Travel Funds is disabled (renders nothing)", () => {
    mockConfig({ enabled: false });
    const onChange = vi.fn();
    const { container } = render(
      <TravelFundsInlineSection token="t" onChange={onChange} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("starts collapsed and emits null when no prefill is provided", () => {
    const { onChange } = renderSection();
    expect(screen.getByRole("button", { name: /Travel Funds/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(lastEmitted(onChange)).toBeNull();
  });
});

describe("TravelFundsInlineSection — auto-expand", () => {
  it("auto-expands when prefill has a localAmount", () => {
    renderSection({ prefill: { localAmount: 30 } });
    expect(screen.getByRole("button", { name: /Travel Funds/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("does not auto-expand when prefill has only a title (no amount)", () => {
    renderSection({ prefill: { title: "Onsen" } });
    expect(screen.getByRole("button", { name: /Travel Funds/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("pre-fills title and amount when both are provided", () => {
    renderSection({ prefill: { title: "Onsen", localAmount: 30 } });
    expect(screen.getByLabelText("Title")).toHaveValue("Onsen");
    expect(screen.getByLabelText("Amount")).toHaveValue("30");
  });
});

describe("TravelFundsInlineSection — discriminated state contract", () => {
  it("emits { value } when title + amount + valid rate are filled and visibility is public+counted", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSection({
      prefill: { title: "Onsen", localAmount: 30 },
    });
    await waitFor(() => {
      const state = lastEmitted(onChange);
      expect(state).not.toBeNull();
      if (!state || !("value" in state)) throw new Error("expected value state");
      expect(state.value.title).toBe("Onsen");
      expect(state.value.localAmount).toBe(30);
      expect(state.value.currencyCode).toBe("USD");
      expect(state.value.localCurrencyPerUsd).toBe(1);
      expect(state.value.countsTowardMeter).toBe(true);
      expect(state.value.visibility).toBe("public");
    });
    // Sanity: changing the amount field updates the emitted value.
    const amountInput = screen.getByLabelText("Amount");
    await user.clear(amountInput);
    await user.type(amountInput, "42");
    await waitFor(() => {
      const state = lastEmitted(onChange);
      if (!state || !("value" in state)) throw new Error("expected value state");
      expect(state.value.localAmount).toBe(42);
    });
  });

  it("emits { error } when the user types an amount but leaves title blank", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSection();
    // Expand the section manually since no prefill auto-opened it.
    await user.click(screen.getByRole("button", { name: /Travel Funds/ }));
    const amountInput = screen.getByLabelText("Amount");
    await user.type(amountInput, "10");
    await waitFor(() => {
      const state = lastEmitted(onChange);
      expect(state).not.toBeNull();
      if (!state || !("error" in state)) throw new Error("expected error state");
      expect(state.error.toLowerCase()).toContain("title");
    });
    // Error shown inline.
    expect(screen.getByRole("alert")).toHaveTextContent(/title/i);
  });

  it("emits null when expanded but truly empty (no title, no amount)", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSection();
    await user.click(screen.getByRole("button", { name: /Travel Funds/ }));
    expect(lastEmitted(onChange)).toBeNull();
  });

  it("emits null when collapsed even if fields had prior values", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSection({
      prefill: { title: "Onsen", localAmount: 30 },
    });
    // Initially auto-expanded; collapse it.
    await user.click(screen.getByRole("button", { name: /Travel Funds/ }));
    await waitFor(() => {
      expect(lastEmitted(onChange)).toBeNull();
    });
  });

  it("emits { error } for invalid exchange rate on non-USD currency", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSection({
      prefill: { title: "Onsen", localAmount: 1500, currencyCode: "JPY", localCurrencyPerUsd: 150 },
    });
    // Confirm valid state first.
    await waitFor(() => {
      const state = lastEmitted(onChange);
      if (!state || !("value" in state)) throw new Error("expected value state");
      expect(state.value.localCurrencyPerUsd).toBe(150);
    });
    // Now zero the rate.
    const rateInput = screen.getByLabelText(/Exchange rate/);
    await user.clear(rateInput);
    await user.type(rateInput, "0");
    await waitFor(() => {
      const state = lastEmitted(onChange);
      if (!state || !("error" in state)) throw new Error("expected error state");
      expect(state.error.toLowerCase()).toContain("rate");
    });
  });
});

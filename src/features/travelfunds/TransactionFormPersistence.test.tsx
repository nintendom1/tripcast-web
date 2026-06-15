import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as convexReact from "convex/react";
import TransactionForm from "./TransactionForm";
import { LS_CURRENCY_RATES, LS_LAST_CURRENCY } from "./currencyPrefs";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("../../debug/useDebugLogger", () => ({
  useDebugLogger: () => ({
    logFunds: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("TransactionForm Persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (vi.mocked(convexReact.useQuery) as any).mockReturnValue(null);
  });

  it("loads last used currency and rate from localStorage in add mode", () => {
    localStorage.setItem(LS_LAST_CURRENCY, "JPY");
    localStorage.setItem(LS_CURRENCY_RATES, JSON.stringify({ JPY: 150 }));

    render(
      <TransactionForm
        token="test-token"
        mode="add"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const currencySelect = screen.getByLabelText("Currency") as HTMLSelectElement;
    expect(currencySelect.value).toBe("JPY");

    const rateInput = screen.getByLabelText(/Exchange rate/) as HTMLInputElement;
    expect(rateInput.value).toBe("150");
  });

  it("updates rate when changing currency if a rate is stored", () => {
    localStorage.setItem(LS_CURRENCY_RATES, JSON.stringify({ EUR: 0.9, JPY: 150 }));

    render(
      <TransactionForm
        token="test-token"
        mode="add"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const currencySelect = screen.getByLabelText("Currency") as HTMLSelectElement;

    // Change to JPY
    fireEvent.change(currencySelect, { target: { value: "JPY" } });
    const rateInput = screen.getByLabelText(/Exchange rate/) as HTMLInputElement;
    expect(rateInput.value).toBe("150");

    // Change to EUR
    fireEvent.change(currencySelect, { target: { value: "EUR" } });
    expect(rateInput.value).toBe("0.9");

    // Change to AUD (not stored) - should default to 1
    fireEvent.change(currencySelect, { target: { value: "AUD" } });
    expect(rateInput.value).toBe("1");

    // Change back to JPY (stored 150)
    fireEvent.change(currencySelect, { target: { value: "JPY" } });
    expect(screen.getByLabelText(/Exchange rate/)).toHaveValue("150");

    // Change to USD (rate input disappears)
    fireEvent.change(currencySelect, { target: { value: "USD" } });
    expect(screen.queryByLabelText(/Exchange rate/)).toBeNull();

    // Change to AUD (not stored, should be 1 because we reset it when selecting USD)
    fireEvent.change(currencySelect, { target: { value: "AUD" } });
    expect(screen.getByLabelText(/Exchange rate/)).toHaveValue("1");
  });

  it("preserves unsaved per-currency rates while switching currencies before submit", () => {
    localStorage.setItem(LS_CURRENCY_RATES, JSON.stringify({ JPY: 150, EUR: 0.9 }));

    render(
      <TransactionForm
        token="test-token"
        mode="add"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const currencySelect = screen.getByLabelText("Currency") as HTMLSelectElement;

    // Switch to JPY and type a new rate 155
    fireEvent.change(currencySelect, { target: { value: "JPY" } });
    const rateInput = screen.getByLabelText(/Exchange rate/) as HTMLInputElement;
    fireEvent.change(rateInput, { target: { value: "155" } });
    expect(rateInput.value).toBe("155");

    // Switch to EUR (should show 0.9)
    fireEvent.change(currencySelect, { target: { value: "EUR" } });
    expect(screen.getByLabelText(/Exchange rate/)).toHaveValue("0.9");

    // Switch back to JPY (should still show unsaved 155, NOT reset to 150)
    fireEvent.change(currencySelect, { target: { value: "JPY" } });
    expect(screen.getByLabelText(/Exchange rate/)).toHaveValue("155");
  });

  it("saves currency and rate to localStorage on successful submit in add mode", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <TransactionForm
        token="test-token"
        mode="add"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Coffee" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "500" } });

    const currencySelect = screen.getByLabelText("Currency") as HTMLSelectElement;
    fireEvent.change(currencySelect, { target: { value: "JPY" } });

    const rateInput = screen.getByLabelText(/Exchange rate/) as HTMLInputElement;
    fireEvent.change(rateInput, { target: { value: "155" } });

    fireEvent.click(screen.getByText("Add"));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());

    expect(localStorage.getItem(LS_LAST_CURRENCY)).toBe("JPY");
    const rates = JSON.parse(localStorage.getItem(LS_CURRENCY_RATES) || "{}");
    expect(rates.JPY).toBe(155);
  });

  it("does not overwrite values in edit mode even if localStorage has values", () => {
    localStorage.setItem(LS_LAST_CURRENCY, "JPY");
    localStorage.setItem(LS_CURRENCY_RATES, JSON.stringify({ JPY: 150, EUR: 0.9 }));

    const initialTransaction: any = {
      _id: "tx1",
      title: "Existing Transaction",
      category: "shopping",
      currencyCode: "EUR",
      localAmount: 10,
      localCurrencyPerUsd: 1.1,
      countsTowardMeter: true,
      visibility: "public",
      occurredAt: Date.now(),
    };

    render(
      <TransactionForm
        token="test-token"
        mode="edit"
        initial={initialTransaction}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const currencySelect = screen.getByLabelText("Currency") as HTMLSelectElement;
    // Should use transaction's EUR, not JPY from localStorage
    expect(currencySelect.value).toBe("EUR");

    const rateInput = screen.getByLabelText(/Exchange rate/) as HTMLInputElement;
    // Should use transaction's 1.1, not 0.9 from localStorage
    expect(rateInput.value).toBe("1.1");
  });

  it("handles 'Other' currency code correctly", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <TransactionForm
        token="test-token"
        mode="add"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Local snack" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "100" } });

    const currencySelect = screen.getByLabelText("Currency") as HTMLSelectElement;
    fireEvent.change(currencySelect, { target: { value: "OTHER" } });

    const customInput = screen.getByLabelText("Currency code") as HTMLInputElement;
    fireEvent.change(customInput, { target: { value: "THB" } });

    const rateInput = screen.getByLabelText(/Exchange rate/) as HTMLInputElement;
    fireEvent.change(rateInput, { target: { value: "35" } });

    fireEvent.click(screen.getByText("Add"));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());

    expect(localStorage.getItem(LS_LAST_CURRENCY)).toBe("THB");
    const rates = JSON.parse(localStorage.getItem(LS_CURRENCY_RATES) || "{}");
    expect(rates.THB).toBe(35);

    // Now check if it loads back
    cleanup();
    render(
      <TransactionForm
        token="test-token"
        mode="add"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // It should select "OTHER" and fill "THB"
    const currencySelect2 = screen.getByLabelText("Currency") as HTMLSelectElement;
    expect(currencySelect2.value).toBe("OTHER");

    const customInput2 = screen.getByLabelText("Currency code") as HTMLInputElement;
    expect(customInput2.value).toBe("THB");

    const rateInput2 = screen.getByLabelText(/Exchange rate/) as HTMLInputElement;
    expect(rateInput2.value).toBe("35");
  });
});

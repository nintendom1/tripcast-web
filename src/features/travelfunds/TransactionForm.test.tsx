import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import TransactionForm from "./TransactionForm";

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

describe("TransactionForm", () => {
  it("defaults to the first category (food) when adding a new transaction", () => {
    (vi.mocked(convexReact.useQuery) as any).mockReturnValue(null); // No current activity

    render(
      <TransactionForm
        token="test-token"
        mode="add"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const categorySelect = screen.getByLabelText("Category") as HTMLSelectElement;
    expect(categorySelect.value).toBe("food");
  });

  it("respects the initial category when in edit mode", () => {
    (vi.mocked(convexReact.useQuery) as any).mockReturnValue(null);

    const initialTransaction: any = {
      _id: "tx1",
      title: "Existing Transaction",
      category: "shopping",
      currencyCode: "USD",
      localAmount: 10,
      localCurrencyPerUsd: 1,
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

    const categorySelect = screen.getByLabelText("Category") as HTMLSelectElement;
    expect(categorySelect.value).toBe("shopping");
  });
});

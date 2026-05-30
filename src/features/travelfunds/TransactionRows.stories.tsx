import type { Meta, StoryObj } from "@storybook/react";
import TransactionRows from "./TransactionRows";

const meta = {
  title: "TravelFunds/TransactionRows",
  component: TransactionRows,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs", "ai-generated"],
  decorators: [
    (Story) => (
      <div className="w-[390px] p-4 bg-[var(--bg-paper)]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TransactionRows>;

export default meta;
type Story = StoryObj<typeof meta>;

const FAKE_TRANSACTIONS: any[] = [
  {
    _id: "tx1",
    title: "Street Tacos",
    category: "food",
    currencyCode: "MXN",
    localAmount: 150,
    localCurrencyPerUsd: 17,
    usdAmount: -8.82,
    countsTowardMeter: true,
    visibility: "public",
    occurredAt: Date.now() - 3600000,
  },
  {
    _id: "tx2",
    title: "Airbnb - Beach House",
    category: "lodging",
    currencyCode: "USD",
    localAmount: 450,
    localCurrencyPerUsd: 1,
    usdAmount: -450,
    countsTowardMeter: true,
    visibility: "summary_only",
    occurredAt: Date.now() - 86400000,
  },
  {
    _id: "tx3",
    title: "Car Rental",
    category: "transport",
    currencyCode: "USD",
    localAmount: 120,
    localCurrencyPerUsd: 1,
    usdAmount: -120,
    countsTowardMeter: false,
    visibility: "private",
    occurredAt: Date.now() - 172800000,
  },
];

export const Default: Story = {
  args: {
    transactions: FAKE_TRANSACTIONS,
    onSelect: (tx) => console.log("Selected transaction:", tx),
  },
};

export const Compact: Story = {
  args: {
    transactions: FAKE_TRANSACTIONS,
    onSelect: (tx) => console.log("Selected transaction:", tx),
    compact: true,
  },
};

export const Empty: Story = {
  args: {
    transactions: [],
    onSelect: (tx) => console.log("Selected transaction:", tx),
  },
};

export const LongList: Story = {
  args: {
    transactions: [...FAKE_TRANSACTIONS, ...FAKE_TRANSACTIONS, ...FAKE_TRANSACTIONS],
    onSelect: (tx) => console.log("Selected transaction:", tx),
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import TravelFundsSheet from "./TravelFundsSheet";
import { tripcastApi } from "../../convex/tripcastApi";

const meta = {
  title: "TravelFunds/TravelFundsSheet",
  component: TravelFundsSheet,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    onClose: { action: "closed" },
  },
} satisfies Meta<typeof TravelFundsSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockConfig = {
  enabled: true,
  startingBudgetUsd: 2000,
  budgetMode: "trip",
  carryoverMode: "none",
  remainingUsd: 1250.5,
  spentUsd: 749.5,
  carryoverDebtUsd: 0,
  budgetLabel: "Summer Eurotrip",
};

const mockDailyConfig = {
  enabled: true,
  startingBudgetUsd: 125,
  budgetMode: "daily",
  carryoverMode: "overspend_only",
  fundsStartAt: new Date().setHours(0, 0, 0, 0) - 86400000 * 3,
  remainingUsd: 72.25,
  spentUsd: 27.75,
  carryoverDebtUsd: 25,
  budgetLabel: "Japan daily fund",
};

const mockTransactions = [
  {
    _id: "t1",
    _creationTime: Date.now() - 86400000,
    title: "Train to Paris",
    currencyCode: "EUR",
    localAmount: 79,
    localCurrencyPerUsd: 0.92,
    amountUsd: 85.5,
    usdAmount: 85.5,
    category: "Transport",
    countsTowardMeter: true,
    visibility: "public",
    occurredAt: Date.now() - 86400000,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
  },
  {
    _id: "t2",
    _creationTime: Date.now() - 172800000,
    title: "Croissants",
    currencyCode: "EUR",
    localAmount: 11,
    localCurrencyPerUsd: 0.92,
    amountUsd: 12.0,
    usdAmount: 12.0,
    category: "Food",
    countsTowardMeter: true,
    visibility: "public",
    occurredAt: Date.now() - 172800000,
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 172800000,
  },
];

/** @tag ai-generated */
export const Summary: Story = {
  args: {
    token: "mock-token",
    onClose: () => {},
  },
  parameters: {
    convexMocks: {
      queries: [
        { query: tripcastApi.travelFunds.travelerGetConfig, result: mockConfig },
        { query: tripcastApi.travelFunds.travelerListTransactions, result: mockTransactions },
      ],
    },
  },
};

/** @tag ai-generated */
export const OverBudget: Story = {
  args: {
    token: "mock-token",
    onClose: () => {},
  },
  parameters: {
    convexMocks: {
      queries: [
        {
          query: tripcastApi.travelFunds.travelerGetConfig,
          result: {
            ...mockConfig,
            remainingUsd: -150.25,
            spentUsd: 2150.25,
          },
        },
        { query: tripcastApi.travelFunds.travelerListTransactions, result: mockTransactions },
      ],
    },
  },
};

/** @tag ai-generated */
export const DailyCarryover: Story = {
  args: {
    token: "mock-token",
    onClose: () => {},
  },
  parameters: {
    convexMocks: {
      queries: [
        { query: tripcastApi.travelFunds.travelerGetConfig, result: mockDailyConfig },
        { query: tripcastApi.travelFunds.travelerListTransactions, result: mockTransactions },
      ],
    },
  },
};

/** @tag ai-generated */
export const Disabled: Story = {
  args: {
    token: "mock-token",
    onClose: () => {},
  },
  parameters: {
    convexMocks: {
      queries: [
        { query: tripcastApi.travelFunds.travelerGetConfig, result: { enabled: false } },
      ],
    },
  },
};

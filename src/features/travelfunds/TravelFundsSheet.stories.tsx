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
  remainingUsd: 1250.5,
  spentUsd: 749.5,
  budgetLabel: "Summer Eurotrip",
};

const mockTransactions = [
  {
    _id: "t1",
    _creationTime: Date.now() - 86400000,
    title: "Train to Paris",
    amountUsd: 85.5,
    category: "Transport",
    occurredAt: Date.now() - 86400000,
  },
  {
    _id: "t2",
    _creationTime: Date.now() - 172800000,
    title: "Croissants",
    amountUsd: 12.0,
    category: "Food",
    occurredAt: Date.now() - 172800000,
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

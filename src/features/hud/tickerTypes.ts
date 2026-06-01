export type TickerMessage = {
  id: string;
  text: string;
};

export type TickerSettings = {
  enabled: boolean;
  priorityMessages: TickerMessage[];
  funFacts: TickerMessage[];
  funFactsEnabled: boolean;
  funFactIntervalMinutes: number;
  lastFunFactAt: number;
};

export const DEFAULT_TICKER_SETTINGS: TickerSettings = {
  enabled: true,
  priorityMessages: [],
  funFacts: [],
  funFactsEnabled: true,
  funFactIntervalMinutes: 10,
  lastFunFactAt: 0,
};

export const TICKER_STORAGE_KEY = "tripcast.ticker_settings";

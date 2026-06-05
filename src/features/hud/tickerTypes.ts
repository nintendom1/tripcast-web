export type TickerMessage = {
  id: string;
  text: string;
  kind?: "alert" | "fact" | "tip";
};

export type TickerSettings = {
  enabled: boolean;
  priorityMessages: TickerMessage[];
  funFacts: TickerMessage[];
  tips: TickerMessage[];
  funFactsEnabled: boolean;
  tipsEnabled: boolean;
  funFactIntervalMinutes: number;
  funFactWeight: number;
  tipWeight: number;
  showPriorityToFollowers: boolean;
  showFunFactsToFollowers: boolean;
  showTipsToFollowers: boolean;
  lastFunFactAt: number;
};

export const DEFAULT_TICKER_SETTINGS: TickerSettings = {
  enabled: true,
  priorityMessages: [],
  funFacts: [],
  tips: [],
  funFactsEnabled: true,
  tipsEnabled: true,
  funFactIntervalMinutes: 10,
  funFactWeight: 1,
  tipWeight: 1,
  showPriorityToFollowers: true,
  showFunFactsToFollowers: true,
  showTipsToFollowers: true,
  lastFunFactAt: 0,
};

export const TICKER_STORAGE_KEY = "tripcast.ticker_settings";

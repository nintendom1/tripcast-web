import { isValidCurrencyCode } from "./currency";

export const LS_LAST_CURRENCY = "tripcast_last_currency";
export const LS_CURRENCY_RATES = "tripcast_currency_rates";

export type CurrencyRates = Record<string, number>;

export type CurrencyPrefs = {
  lastCurrency: string;
  rates: CurrencyRates;
};

export function loadCurrencyPrefs(): CurrencyPrefs {
  try {
    const rawLast = localStorage.getItem(LS_LAST_CURRENCY) ?? "USD";
    const lastCurrency = isValidCurrencyCode(rawLast)
      ? rawLast.trim().toUpperCase()
      : "USD";

    const rawRates = localStorage.getItem(LS_CURRENCY_RATES);
    const rates: CurrencyRates = {};
    if (rawRates) {
      try {
        const parsed = JSON.parse(rawRates);
        if (parsed && typeof parsed === "object") {
          for (const [code, rate] of Object.entries(parsed)) {
            const normalized =
              typeof code === "string" ? code.trim().toUpperCase() : "";
            if (
              isValidCurrencyCode(normalized) &&
              typeof rate === "number" &&
              rate > 0
            ) {
              rates[normalized] = rate;
            }
          }
        }
      } catch {
        // ignore parse errors
      }
    }
    return { lastCurrency, rates };
  } catch (e) {
    console.error("Failed to load currency preferences", e);
    return { lastCurrency: "USD", rates: {} };
  }
}

export function saveCurrencyPrefs(prefs: CurrencyPrefs) {
  try {
    localStorage.setItem(LS_LAST_CURRENCY, prefs.lastCurrency);
    localStorage.setItem(LS_CURRENCY_RATES, JSON.stringify(prefs.rates));
  } catch (e) {
    console.error("Failed to save currency preferences", e);
  }
}

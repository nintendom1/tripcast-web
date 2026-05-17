import { describe, expect, it } from "vitest";

import {
  COMMON_CURRENCIES,
  CATEGORY_OPTIONS,
  VISIBILITY_OPTIONS,
  formatUsd,
  formatLocal,
  isValidCurrencyCode,
  getCategoryLabel,
  getCategoryEmoji,
} from "./currency";

describe("formatUsd", () => {
  it("formats positive amounts with two decimals and dollar sign", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(4.5)).toBe("$4.50");
    expect(formatUsd(100)).toBe("$100.00");
  });

  it("uses a leading minus sign for negatives, not parentheses", () => {
    expect(formatUsd(-4.5)).toBe("-$4.50");
    expect(formatUsd(-0.01)).toBe("-$0.01");
  });
});

describe("formatLocal", () => {
  it("uses two decimals for typical currencies", () => {
    expect(formatLocal(12.5, "EUR")).toBe("12.50 EUR");
    expect(formatLocal(0, "USD")).toBe("0.00 USD");
  });

  it("uses no decimals for JPY and KRW (subunits unused in practice)", () => {
    expect(formatLocal(1500, "JPY")).toBe("1500 JPY");
    expect(formatLocal(25000, "KRW")).toBe("25000 KRW");
  });
});

describe("isValidCurrencyCode", () => {
  it("accepts three-letter uppercase codes", () => {
    expect(isValidCurrencyCode("USD")).toBe(true);
    expect(isValidCurrencyCode("eur")).toBe(true); // normalized
    expect(isValidCurrencyCode(" JPY ")).toBe(true); // trimmed
  });

  it("rejects non-three-letter input", () => {
    expect(isValidCurrencyCode("US")).toBe(false);
    expect(isValidCurrencyCode("USDD")).toBe(false);
    expect(isValidCurrencyCode("1USD")).toBe(false);
    expect(isValidCurrencyCode("")).toBe(false);
  });
});

describe("category helpers", () => {
  it("returns a label and emoji for every known category", () => {
    for (const opt of CATEGORY_OPTIONS) {
      expect(getCategoryLabel(opt.value)).toBe(opt.label);
      expect(getCategoryEmoji(opt.value)).toBe(opt.emoji);
    }
  });
});

describe("static option lists", () => {
  it("COMMON_CURRENCIES includes USD as the first option (default)", () => {
    expect(COMMON_CURRENCIES[0]?.code).toBe("USD");
  });

  it("VISIBILITY_OPTIONS exposes exactly public/summary_only/private", () => {
    expect(VISIBILITY_OPTIONS.map((o) => o.value).sort()).toEqual(
      ["private", "public", "summary_only"],
    );
  });
});

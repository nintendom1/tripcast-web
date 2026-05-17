import type { TransactionCategory, TransactionVisibility } from "../../convex/tripcastApi";

export const COMMON_CURRENCIES: { code: string; label: string }[] = [
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "JPY", label: "JPY — Japanese Yen" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "KRW", label: "KRW — Korean Won" },
  { code: "CNY", label: "CNY — Chinese Yuan" },
  { code: "MXN", label: "MXN — Mexican Peso" },
];

export const CATEGORY_OPTIONS: { value: TransactionCategory; label: string; emoji: string }[] = [
  { value: "food", label: "Food", emoji: "🍜" },
  { value: "transport", label: "Transport", emoji: "🚆" },
  { value: "lodging", label: "Lodging", emoji: "🛏️" },
  { value: "event", label: "Event", emoji: "🎟️" },
  { value: "shopping", label: "Shopping", emoji: "🛍️" },
  { value: "souvenirs", label: "Souvenirs", emoji: "🎁" },
  { value: "logistics", label: "Logistics", emoji: "🧳" },
  { value: "research", label: "Research", emoji: "🔎" },
  { value: "other", label: "Other", emoji: "💸" },
];

export const VISIBILITY_OPTIONS: { value: TransactionVisibility; label: string; desc: string }[] = [
  { value: "public", label: "Public", desc: "Support Crew sees full details." },
  {
    value: "summary_only",
    label: "Summary only",
    desc: "Support Crew sees the USD amount but no title or category.",
  },
  {
    value: "private",
    label: "Private",
    desc: "Support Crew sees no details; meter still updates if counted.",
  },
];

export function formatUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toFixed(2)}`;
}

export function formatLocal(amount: number, code: string): string {
  // JPY/KRW typically have no decimals — show whole numbers when amount is integer.
  const noDecimal = code === "JPY" || code === "KRW";
  const fixed = noDecimal ? Math.round(amount).toString() : amount.toFixed(2);
  return `${fixed} ${code}`;
}

export function isValidCurrencyCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code.trim().toUpperCase());
}

export function getCategoryLabel(category: TransactionCategory): string {
  return CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? "Other";
}

export function getCategoryEmoji(category: TransactionCategory): string {
  return CATEGORY_OPTIONS.find((c) => c.value === category)?.emoji ?? "💸";
}

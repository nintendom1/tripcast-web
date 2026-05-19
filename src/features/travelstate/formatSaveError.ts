/**
 * Formats backend errors from Traveler State / Auto State mutations into a
 * short user-facing message. Shared by `TravelerStateSheet` and
 * `AutoStateTab` so rate-limit and access errors render identically.
 */
export function formatSaveError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (lower.includes("too many") || lower.includes("rate")) {
    return "Too many updates. Try again in a minute.";
  }
  if (lower.includes("traveler")) {
    return "Traveler access is required.";
  }
  return "Failed to save. Please try again.";
}

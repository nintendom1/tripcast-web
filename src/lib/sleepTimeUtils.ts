/**
 * Converts a local time (HH, MM) to UTC minutes from midnight.
 * Uses the browser's current timezone offset (accounts for DST at time of call).
 */
export function localHHMMToUtcMinutes(hh: number, mm: number): number {
  const localMinutes = hh * 60 + mm;
  const offsetMinutes = -new Date().getTimezoneOffset(); // positive = ahead of UTC
  return ((localMinutes - offsetMinutes) % 1440 + 1440) % 1440;
}

/**
 * Converts UTC minutes from midnight to a local time string "HH:MM".
 * Suitable for use as the value of an <input type="time">.
 */
export function utcMinutesToLocalTimeString(utcMinutes: number): string {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const local = ((utcMinutes + offsetMinutes) % 1440 + 1440) % 1440;
  const hh = Math.floor(local / 60);
  const mm = local % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export const STALE_THRESHOLD_OPTIONS: Array<{ label: string; valueMs: number }> = [
  { label: "30 min", valueMs: 1_800_000 },
  { label: "1 hour", valueMs: 3_600_000 },
  { label: "2 hours", valueMs: 7_200_000 },
  { label: "4 hours", valueMs: 14_400_000 },
];

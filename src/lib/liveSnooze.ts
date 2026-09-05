const SNOOZE_STORAGE_KEY = "tripcast.live-sharing.snoozed-until";

export function readLiveSnooze(): number | null {
  try {
    const value = Number(localStorage.getItem(SNOOZE_STORAGE_KEY));
    if (!Number.isFinite(value) || value <= 0 || value - Date.now() >= 24 * 60 * 60 * 1000) {
      localStorage.removeItem(SNOOZE_STORAGE_KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function writeLiveSnooze(until: number): void {
  if (!Number.isFinite(until) || until <= Date.now() || until - Date.now() >= 24 * 60 * 60 * 1000) {
    throw new Error("Snooze time must be within the next 24 hours.");
  }
  localStorage.setItem(SNOOZE_STORAGE_KEY, String(Math.round(until)));
}

export function clearLiveSnooze(): void {
  try {
    localStorage.removeItem(SNOOZE_STORAGE_KEY);
  } catch {
    // The in-memory state remains authoritative for this session.
  }
}

export function timeInputValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function nextOccurrence(time: string, now = new Date()): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new Error("Choose a valid time.");
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error("Choose a valid time.");
  const result = new Date(now);
  result.setHours(hours, minutes, 0, 0);
  if (result.getTime() <= now.getTime()) result.setDate(result.getDate() + 1);
  return result.getTime();
}

export function formatSnoozeOccurrence(until: number, now = new Date()): string {
  const date = new Date(until);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sameDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
  const day = sameDay(date, now) ? "Today" : sameDay(date, tomorrow) ? "Tomorrow" : date.toLocaleDateString();
  return `${day} at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export function presetSnoozeTime(minutes: number, now = new Date()): string {
  return timeInputValue(new Date(now.getTime() + minutes * 60 * 1000));
}

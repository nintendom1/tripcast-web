import { distanceMeters } from "../../lib/geoUtils";

// 3 m keeps a walking dot (1.4 m/s) at most about 2 s behind.
export const BROWSER_FIX_MIN_MOVE_METERS = 3;
// Half the reported accuracy stops indoor jitter (accuracy 20 m moves the estimate several metres with the phone still).
export const BROWSER_FIX_ACCURACY_MOVE_FACTOR = 0.5;
// At 60 to 100 m accuracy, half the accuracy alone held a walking dot (1.4 m/s) for 22 to 30 s.
// Capped at 10 m, the dot is at most about 7 s behind, inside its own accuracy circle.
export const BROWSER_FIX_MAX_MOVE_METERS = 10;
// An accuracy gain of 10 m is a real improvement worth redrawing the circle for.
export const BROWSER_FIX_ACCURACY_IMPROVEMENT_METERS = 10;
// Accuracy getting worse by 20 m or more must show: the accuracy circle has to grow.
export const BROWSER_FIX_ACCURACY_WORSENING_METERS = 20;
// Reception flicker of 25 m each second re-drew the map every second; 5 s caps accuracy-only redraws
// at 1/5 of that while the circle still follows a real change within 5 s.
export const BROWSER_FIX_ACCURACY_ONLY_MIN_INTERVAL_MS = 5_000;
// 30 s keeps the dot's freshness and any staleness logic alive at 1/30 of the old work.
export const BROWSER_FIX_MAX_AGE_MS = 30_000;
// Coalesced-callback log period; same 30 s so the log also shows the real callback rate.
export const BROWSER_FIX_REPORT_PERIOD_MS = 30_000;

export type BrowserFixGateReport = { received: number; rejected: number; periodMs: number };

export type BrowserFixGate = {
  /**
   * Decide whether to handle this fix. `report` is set when a 30 s period with rejections ended.
   * `force` accepts the fix regardless (for example a cloaking-zone crossing) and anchors on it.
   */
  check: (
    fix: { lat: number; lon: number; accuracy?: number },
    now: number,
    force?: boolean,
  ) => {
    accept: boolean;
    report: BrowserFixGateReport | null;
  };
};

export function createBrowserFixGate(): BrowserFixGate {
  let last: { lat: number; lon: number; accuracy?: number; at: number } | null = null;
  // When the last fix accepted only because its accuracy changed; movement and forced fixes do not count.
  let lastAccuracyOnlyAcceptAt: number | null = null;
  let periodStartAt: number | null = null;
  let received = 0;
  let rejected = 0;

  return {
    check(fix, now, force = false) {
      // The wall clock moved back: the age bound cannot be trusted, so accept and restart the period.
      const clockWentBack = last !== null && now < last.at;
      if (periodStartAt === null || clockWentBack) {
        periodStartAt = now;
        received = 0;
        rejected = 0;
      }
      if (clockWentBack) lastAccuracyOnlyAcceptAt = null;
      received += 1;

      let accept = false;
      if (force || last === null || clockWentBack || now - last.at >= BROWSER_FIX_MAX_AGE_MS) {
        accept = true;
      } else {
        const threshold = Math.min(
          BROWSER_FIX_MAX_MOVE_METERS,
          Math.max(BROWSER_FIX_MIN_MOVE_METERS, (fix.accuracy ?? 0) * BROWSER_FIX_ACCURACY_MOVE_FACTOR),
        );
        // Positive when the new fix is more accurate, negative when it is worse.
        const accuracyGain =
          typeof last.accuracy === "number" && typeof fix.accuracy === "number"
            ? last.accuracy - fix.accuracy
            : 0;
        if (distanceMeters(last, fix) >= threshold) {
          accept = true;
        } else if (
          accuracyGain >= BROWSER_FIX_ACCURACY_IMPROVEMENT_METERS ||
          -accuracyGain >= BROWSER_FIX_ACCURACY_WORSENING_METERS
        ) {
          if (
            lastAccuracyOnlyAcceptAt === null ||
            now - lastAccuracyOnlyAcceptAt >= BROWSER_FIX_ACCURACY_ONLY_MIN_INTERVAL_MS
          ) {
            accept = true;
            lastAccuracyOnlyAcceptAt = now;
          }
        }
      }

      if (accept) last = { lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy, at: now };
      else rejected += 1;

      let report: BrowserFixGateReport | null = null;
      if (now - periodStartAt >= BROWSER_FIX_REPORT_PERIOD_MS) {
        if (rejected > 0) report = { received, rejected, periodMs: now - periodStartAt };
        periodStartAt = now;
        received = 0;
        rejected = 0;
      }
      return { accept, report };
    },
  };
}

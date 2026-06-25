import { Capacitor } from "@capacitor/core";
import { nativeLocationManager } from "./nativeLocationManager";

/**
 * Foreground-only, high-frequency location watcher used by the Movement
 * Detection calibration modal. The everyday watcher in `locationWatcher.ts`
 * uses a 50m distanceFilter to save battery; that is far too coarse when the
 * Traveler is trying to tune walking-speed thresholds (a fix every ~50s while
 * walking). This watcher sets `distanceFilter: 0` and omits `backgroundMessage`
 * so the OS stops delivering fixes the moment the app is backgrounded — both
 * properties bound the battery cost to an active calibration session.
 */

export type CalibrationFix = {
  lat: number;
  lon: number;
  accuracy?: number;
  speed?: number;
  at: number;
};

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function startCalibrationLocationWatch(
  onFix: (fix: CalibrationFix) => void,
  onError: (error: unknown) => void,
): () => void {
  if (isNative()) {
    const id = nativeLocationManager.addWatcher(
      {
        requestPermissions: true,
        distanceFilter: 0,
      },
      (fix) => {
        onFix({
          ...fix,
          at: Date.now(),
        });
      },
      onError,
    );

    return () => {
      nativeLocationManager.removeWatcher(id);
    };
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const speedRaw = pos.coords.speed;
      onFix({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? undefined,
        speed: typeof speedRaw === "number" && speedRaw >= 0 ? speedRaw : undefined,
        at: Date.now(),
      });
    },
    onError,
    { enableHighAccuracy: true, maximumAge: 0 },
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}

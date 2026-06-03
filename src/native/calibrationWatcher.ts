import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";

/**
 * Foreground-only, high-frequency location watcher used by the Movement
 * Detection calibration modal. The everyday watcher in `locationWatcher.ts`
 * uses a 50m distanceFilter to save battery; that is far too coarse when the
 * Traveler is trying to tune walking-speed thresholds (a fix every ~50s while
 * walking). This watcher sets `distanceFilter: 0` and omits `backgroundMessage`
 * so the OS stops delivering fixes the moment the app is backgrounded — both
 * properties bound the battery cost to an active calibration session.
 */

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  "BackgroundGeolocation",
);

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
    let watcherId: string | null = null;
    let cancelled = false;

    BackgroundGeolocation.addWatcher(
      {
        requestPermissions: true,
        distanceFilter: 0,
      },
      (location, error) => {
        if (error) {
          onError(error);
          return;
        }
        if (!location) return;
        const speedRaw = (location as { speed?: number | null }).speed;
        onFix({
          lat: location.latitude,
          lon: location.longitude,
          accuracy: location.accuracy,
          speed: typeof speedRaw === "number" && speedRaw >= 0 ? speedRaw : undefined,
          at: Date.now(),
        });
      },
    )
      .then((id) => {
        if (cancelled) {
          void BackgroundGeolocation.removeWatcher({ id });
          return;
        }
        watcherId = id;
      })
      .catch(onError);

    return () => {
      cancelled = true;
      if (watcherId) {
        void BackgroundGeolocation.removeWatcher({ id: watcherId });
        watcherId = null;
      }
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

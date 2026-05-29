import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";

/**
 * Native (Capacitor) location source. iOS browsers / PWAs cannot emit GPS while
 * the screen is locked; the native background-geolocation plugin can. This
 * module wraps that plugin behind a platform guard so the web build (and jsdom
 * tests) never touch the native bridge — `isNativeLocationAvailable()` is false
 * off-device, and callers fall back to `navigator.geolocation`.
 */

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  "BackgroundGeolocation",
);

// Meters the device must move before a new fix fires — the plugin's main
// battery lever. Set to 50m so the GPS wakes less often; the server already
// dedupes at 200m/60s and the publish* throttles trim further, so a tighter
// filter would only burn battery.
const DISTANCE_FILTER_METERS = 50;

export type NativeLocationFix = { lat: number; lon: number; accuracy?: number };

export function isNativeLocationAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

/** Open the iOS Settings page for this app, so a user who denied location can re-enable it. */
export function openNativeLocationSettings(): void {
  void BackgroundGeolocation.openSettings();
}

/**
 * Start a background-capable location watch. Defining `backgroundMessage` is
 * what tells the plugin to keep delivering fixes while backgrounded/locked
 * (the message is only surfaced as a notification on Android; iOS ignores it).
 * Returns a cleanup function that removes the watcher.
 */
export function startNativeLocationWatch(
  onFix: (fix: NativeLocationFix) => void,
  onError: (error: unknown) => void,
): () => void {
  let watcherId: string | null = null;
  let cancelled = false;

  BackgroundGeolocation.addWatcher(
    {
      backgroundMessage: "TripCast is sharing your live location.",
      backgroundTitle: "TripCast — Live location",
      requestPermissions: true,
      distanceFilter: DISTANCE_FILTER_METERS,
    },
    (location, error) => {
      if (error) {
        onError(error);
        return;
      }
      if (!location) return;
      onFix({
        lat: location.latitude,
        lon: location.longitude,
        accuracy: location.accuracy,
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

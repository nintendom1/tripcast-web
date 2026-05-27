import { useSyncExternalStore } from "react";
import { getCenteringCalibration, subscribe } from "./debugLogger";

/**
 * Reactive read of the map-centering calibration dev setting. When true, map
 * sheets suppress outside-press dismissal (so you can drag the map to teach pin
 * centering without the sheet closing) and an on-map indicator is shown.
 */
export function useCenteringCalibration(): boolean {
  return useSyncExternalStore(subscribe, getCenteringCalibration, () => false);
}

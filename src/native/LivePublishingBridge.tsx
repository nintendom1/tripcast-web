import { useNativePublishingConfig, type NativePublishingConfigOptions } from "./useNativePublishingConfig";

/** Props of `LivePublishingBridge`; final. */
export type LivePublishingBridgeProps = NativePublishingConfigOptions;

/**
 * Headless owner of native live publishing, mounted in `App.tsx` inside `TripContextProvider` and OUTSIDE the map
 * error boundary, so private viewing, a map crash or a map reset never reconfigures publishing (each `configure()`
 * cancels the in-flight upload).
 *
 * Final behaviour (W2): runs `useNativePublishingConfig`, keyed only on token, role and the current
 * trip/epoch/title. Renders nothing. WC stub: renders nothing and does nothing.
 */
export function LivePublishingBridge(props: LivePublishingBridgeProps) {
  useNativePublishingConfig(props);
  return null;
}

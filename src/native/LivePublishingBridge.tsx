import { useSyncExternalStore } from "react";
import { ErrorBoundary } from "react-error-boundary";

import type { Role } from "../convex/tripcastApi";
import { getNativePublishingRetryNonce, subscribeNativePublishingRetry, type NativePublishingTags } from "./nativePublishingSignal";
import {
  useNativePublishingConfig,
  usePublishingIdentity,
  useTripChangeStop,
  type NativePublishingConfigOptions,
  type PublishingIdentity,
} from "./useNativePublishingConfig";

/** Props of `LivePublishingBridge`; final. */
export type LivePublishingBridgeProps = NativePublishingConfigOptions;

function TripChangeStop({ token, role, tags }: { token: string; role: Role; tags: NativePublishingTags | null }) {
  useTripChangeStop(token, role, tags);
  return null;
}

function NativePublishingConfig({ identity, ...options }: LivePublishingBridgeProps & { identity: PublishingIdentity }) {
  useNativePublishingConfig(options, identity);
  return null;
}

function logBridgeError(error: unknown) {
  console.error("Live publishing bridge failed", error);
}

/**
 * Headless owner of native live publishing, mounted in `App.tsx` inside `TripContextProvider` and OUTSIDE the map
 * error boundary, so private viewing, a map crash or a map reset never reconfigures publishing (each `configure()`
 * cancels the in-flight upload). Renders nothing.
 *
 * It resolves the publishing identity (`usePublishingIdentity`: the shared current trip, or its last known value while
 * the trip state loads or fails), ends live sharing on a trip change (`useTripChangeStop`, no settings queries) and,
 * after that, configures the phone (`useNativePublishingConfig`). Only the configure part reads settings queries, so
 * only it sits in an error boundary that keeps a failing query from unmounting the app; TripMap's Retry (the retry
 * nonce) or a new session remounts it.
 */
export function LivePublishingBridge(props: LivePublishingBridgeProps) {
  const identity = usePublishingIdentity(props.token, props.role);
  const retryNonce = useSyncExternalStore(
    subscribeNativePublishingRetry,
    getNativePublishingRetryNonce,
    getNativePublishingRetryNonce,
  );
  return (
    <>
      <TripChangeStop token={props.token} role={props.role} tags={identity.tags} />
      <ErrorBoundary fallbackRender={() => null} resetKeys={[props.token, props.role, retryNonce]} onError={logBridgeError}>
        <NativePublishingConfig {...props} identity={identity} />
      </ErrorBoundary>
    </>
  );
}

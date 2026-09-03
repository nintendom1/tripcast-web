import { useEffect, useState } from "react";

import type { VerificationLivePhase } from "../features/auth/SessionVerificationLiveControl";
import {
  acceptNativeLegacyBootstrapFix,
  beginNativeLegacyBootstrapPublishing,
  getNativeBootstrapPublishingState,
  startNativeLocationWatch,
} from "./locationWatcher";
import { useNativeReadinessState } from "./nativeReadinessState";
import { useNativeTrackingState } from "./nativeTrackingState";

type BootstrapBasePhase = "idle" | "checking" | "registered" | "configuration-missing" | "degraded";

export function useVerificationLiveBootstrap({
  holdLease,
  adaptiveEnabled,
}: {
  holdLease: boolean;
  adaptiveEnabled: boolean;
}) {
  const [basePhase, setBasePhase] = useState<BootstrapBasePhase>("idle");
  const [liveTrailEnabled, setLiveTrailEnabled] = useState<boolean | null>(null);
  const trackingState = useNativeTrackingState();
  const readinessState = useNativeReadinessState();

  useEffect(() => {
    if (!holdLease) {
      setBasePhase("idle");
      return;
    }

    let cancelled = false;
    let releaseLease: (() => void) | null = null;
    setBasePhase("checking");

    void getNativeBootstrapPublishingState()
      .then(async (publishingState) => {
        if (cancelled) return;
        setLiveTrailEnabled(publishingState.liveTrailEnabled);
        if (!publishingState.configurationReady) {
          setBasePhase("configuration-missing");
          return;
        }

        if (!adaptiveEnabled) {
          await beginNativeLegacyBootstrapPublishing();
          if (cancelled) return;
        }

        releaseLease = startNativeLocationWatch(
          (fix) => {
            if (adaptiveEnabled) return;
            void acceptNativeLegacyBootstrapFix(fix).catch(() => {
              if (!cancelled) setBasePhase("degraded");
            });
          },
          () => {
            if (!cancelled) setBasePhase("degraded");
          },
          adaptiveEnabled,
          false,
        );
        setBasePhase("registered");
      })
      .catch(() => {
        if (!cancelled) setBasePhase("degraded");
      });

    return () => {
      cancelled = true;
      releaseLease?.();
    };
  }, [adaptiveEnabled, holdLease]);

  let phase: VerificationLivePhase;
  if (basePhase === "configuration-missing" || basePhase === "degraded") {
    phase = basePhase;
  } else if (basePhase === "idle" || basePhase === "checking") {
    phase = basePhase;
  } else if (adaptiveEnabled) {
    phase = readinessState.captureReadiness === "degraded"
      ? "degraded"
      : readinessState.captureReadiness === "ready" ||
          trackingState.mode === "precise" ||
          trackingState.mode === "power-saving"
        ? "active"
        : "starting";
  } else {
    phase = trackingState.mode === "legacy" ? "active" : "starting";
  }

  return { phase, liveTrailEnabled };
}

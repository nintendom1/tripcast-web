import React, { Suspense, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ErrorBoundary } from "react-error-boundary";
import { AnimatePresence, motion } from "framer-motion";

import { tripcastApi } from "./convex/tripcastApi";
import {
  clearStoredSession,
  getStoredSession,
  setStoredSession,
  type StoredSession,
} from "./lib/auth";
import { Button } from "./components/ui/button";
import AuthScreen from "./features/auth/AuthScreen";
import FollowerLoginScreen from "./features/auth/FollowerLoginScreen";
import InviteRedemptionScreen from "./features/auth/InviteRedemptionScreen";
import PasswordResetScreen from "./features/auth/PasswordResetScreen";
import OptionsSheet, { type OptionsView } from "./features/options/OptionsSheet";
import EndTripSheet from "./features/endtrip/EndTripSheet";
import CreditsOverlay from "./features/endtrip/CreditsOverlay";
import FollowerManagementPage from "./features/followers/FollowerManagementPage";
import { TopBar, TripTicker, useTicker } from "./features/hud";
import {
  CreateAccountIntroFlow,
  IntroSequence,
  markLocalIntroSeen,
} from "./features/onboarding/IntroSequence";
import { FullScreenErrorFallback } from "./components/resilience/ErrorFallbacks";
import { FeatureBoundary } from "./components/resilience/FeatureBoundary";
import { PendingNotice } from "./components/resilience/PendingNotice";
import { useDelayedPending } from "./components/resilience/useDelayedPending";
import { useOnlineStatus } from "./components/resilience/useOnlineStatus";
import { useMusicSafe } from "./providers/MusicProvider";
import { getLocalDateKey } from "./features/achievements/dateUtils";
import { useInteractionLogger } from "./debug/useInteractionLogger";
import DebugErrorBoundary from "./debug/DebugErrorBoundary";
import { CrashOnDemand, disarmCrash } from "./debug/crashTrigger";
import { log as debugLog } from "./debug/debugLogger";
import { ThemeProvider, TravelerThemeBridge } from "./providers/ThemeProvider";

const TripMap = React.lazy(() => import("./features/map/TripMap"));

const PANEL_MOTION = {
  initial: { y: 40, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 40, opacity: 0 },
  transition: { duration: 0.18, ease: "easeOut" as const },
};

function MapErrorFallback(props: React.ComponentProps<typeof FullScreenErrorFallback>) {
  useEffect(() => {
    debugLog("info", "App", "map:fallback:shown", "map", {
      message: props.error instanceof Error ? props.error.message : String(props.error),
    });
  }, [props.error]);

  return (
    <FullScreenErrorFallback
      {...props}
      resetErrorBoundary={() => {
        debugLog("info", "App", "map:fallback:retry", "map", {
          message: props.error instanceof Error ? props.error.message : String(props.error),
        });
        props.resetErrorBoundary();
      }}
      title="The map could not load."
      message="Try again, or reload the app if the map keeps failing."
    />
  );
}

type AppProps = {
  convexReady: boolean;
};

export default function App({ convexReady }: AppProps) {
  if (!convexReady) {
    return (
      <div className="flex flex-col h-dvh">
        <header className="flex items-center min-h-14 px-4 border-b bg-background">
          <h1 className="text-lg font-bold">TripCast</h1>
        </header>
        <div className="m-6 max-w-[520px]">
          <p>
            <strong>VITE_CONVEX_URL is not set.</strong> Configure Convex to use TripCast.
          </p>
        </div>
      </div>
    );
  }
  return (
    <ErrorBoundary
      FallbackComponent={FullScreenErrorFallback}
      onError={(error, info) => {
        console.error("Root render failure", error, info);
        const err = error instanceof Error ? error : null;
        debugLog("error", "App", "react:root-error", "error", {
          message: err?.message ?? String(error),
          name: err?.name ?? typeof error,
          stack: err?.stack?.slice(0, 400),
          componentStack: info.componentStack?.slice(0, 400),
        });
      }}
    >
      <DebugErrorBoundary>
        <ThemeProvider>
          <ConnectedApp />
        </ThemeProvider>
      </DebugErrorBoundary>
    </ErrorBoundary>
  );
}

function ConnectedApp() {
  const [inviteToken] = useState(() => new URLSearchParams(window.location.search).get("invite"));
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get("reset"));
  const [showTravelerLogin, setShowTravelerLogin] = useState(false);
  const [pendingInviteToken, setPendingInviteToken] = useState(inviteToken);
  const [pendingResetToken, setPendingResetToken] = useState(resetToken);

  const [session, setSession] = useState<StoredSession | null>(getStoredSession);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isEndTripOpen, setIsEndTripOpen] = useState(false);
  const [isCreditsOpen, setIsCreditsOpen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  // True while TripMap is in crosshair coordinate-pick mode. Used to hide the
  // TopBar / TripTicker so they don't overlap the picker's helper banner.
  const [isPickerActive, setIsPickerActive] = useState(false);
  const [hasAutoOpenedCredits, setHasAutoOpenedCredits] = useState(false);
  const [optionsDefaultView, setOptionsDefaultView] = useState<OptionsView>("options");
  const [preserveDebugContext, setPreserveDebugContext] = useState(false);
  const [view, setView] = useState<"map" | "follower-management">("map");
  const music = useMusicSafe();
  const [isIntroReplayOpen, setIsIntroReplayOpen] = useState(false);
  const [isCreateAccountIntroOpen, setIsCreateAccountIntroOpen] = useState(false);
  const [locationResetNonce, setLocationResetNonce] = useState(0);
  const [tripDataResetNonce, setTripDataResetNonce] = useState(0);
  const [sessionRetryNonce, setSessionRetryNonce] = useState(0);
  const [resetToastMessage, setResetToastMessage] = useState<string | null>(null);
  const resetToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useInteractionLogger();

  // App initialization (fires on every full page load / refresh).
  useEffect(() => {
    debugLog("info", "App", "app:init", "ui", {
      online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      hadStoredSession: getStoredSession() !== null,
    });
  }, []);

  // Keep the soundtrack silent while unauthenticated (login / no session) and
  // restore it the instant a session exists. Declarative on `session`, so it
  // can never strand the "auth" suppression reason. Must stay above the early
  // returns below for stable hook order + to re-run on every session change.
  useEffect(() => {
    music.setSuppressed("auth", session === null);
    debugLog("info", "App", "audio:auth-suppress", "audio", { suppressed: session === null });
  }, [session, music]);

  useEffect(() => {
    const onError = (e: ErrorEvent) =>
      debugLog("error", "window", "global:error", "error", { message: e.message, filename: e.filename, line: e.lineno });
    const onUnhandled = (e: PromiseRejectionEvent) =>
      debugLog("error", "window", "global:unhandledrejection", "error", { reason: String(e.reason) });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, []);

  const legacySessionCheck = useQuery(
    tripcastApi.auth.currentSession,
    session !== null && session.sessionType !== "follower" ? { token: session.token } : "skip",
  );
  const followerSessionCheck = useQuery(
    tripcastApi.followers.followerCurrentSession,
    session !== null && session.sessionType === "follower" ? { token: session.token } : "skip",
  );

  const activeSessionCheck =
    session?.sessionType === "follower" ? followerSessionCheck : legacySessionCheck;
  const verifiedSessionToken =
    session !== null && activeSessionCheck ? session.token : undefined;
  const { currentMessage, isPriority, onFunFactComplete } = useTicker(verifiedSessionToken);

  const credits = useQuery(
    tripcastApi.endTrip.getTripCredits,
    verifiedSessionToken ? { token: verifiedSessionToken } : "skip",
  );

  const signOutMutation = useMutation(tripcastApi.auth.signOut);
  const followerSignOutMutation = useMutation(tripcastApi.followers.followerSignOut);
  const recordDailyVisit = useMutation(tripcastApi.scoring.recordDailyVisit);
  const dailyVisitTokenRef = useRef<string | null>(null);
  const sessionCheckIsDelayed = useDelayedPending(
    session !== null && activeSessionCheck === undefined,
    5000,
    sessionRetryNonce,
  );
  const isOnline = useOnlineStatus();

  useEffect(() => {
    if (session !== null && activeSessionCheck === null) {
      clearStoredSession();
      setSession(null);
    }
  }, [session, activeSessionCheck]);

  useEffect(() => {
    return () => {
      if (resetToastTimeoutRef.current !== null) {
        clearTimeout(resetToastTimeoutRef.current);
      }
    };
  }, []);

  // Auto-play credits finale when the trip is already ended on app load.
  // Respects priority flows (intro sequence) and fires once per session.
  useEffect(() => {
    if (
      credits?.ended &&
      mapLoaded &&
      !hasAutoOpenedCredits &&
      !isIntroReplayOpen &&
      !isCreateAccountIntroOpen
    ) {
      setIsCreditsOpen(true);
      setHasAutoOpenedCredits(true);
    }
  }, [
    credits?.ended,
    mapLoaded,
    hasAutoOpenedCredits,
    isIntroReplayOpen,
    isCreateAccountIntroOpen,
  ]);

  // Daily-visit scoring: fire once per session token after the session
  // validates. Idempotent + no-op server-side when there is no scoring
  // identity (e.g. a Traveler with developer scoring disabled).
  useEffect(() => {
    if (
      session !== null &&
      activeSessionCheck &&
      typeof activeSessionCheck === "object" &&
      dailyVisitTokenRef.current !== session.token
    ) {
      dailyVisitTokenRef.current = session.token;
      void Promise.resolve()
        .then(() =>
          recordDailyVisit({
            token: session.token,
            localDateKey: getLocalDateKey(),
          }),
        )
        .catch(() => {});
    }
  }, [session, activeSessionCheck, recordDailyVisit]);

  function handleSignIn(
    newSession: StoredSession,
    options?: { playCreateAccountIntro?: boolean },
  ) {
    setStoredSession(newSession);
    setSession(newSession);
    setPendingInviteToken(null);
    setPendingResetToken(null);
    setIsCreateAccountIntroOpen(Boolean(options?.playCreateAccountIntro));
    history.replaceState({}, "", window.location.pathname);
  }

  async function handleSignOut() {
    if (session) {
      try {
        if (session.sessionType === "follower") {
          await followerSignOutMutation({ token: session.token });
        } else {
          await signOutMutation({ token: session.token });
        }
      } catch {
        // best-effort server-side cleanup
      }
    }
    clearStoredSession();
    setSession(null);
    setIsCreateAccountIntroOpen(false);
    setIsIntroReplayOpen(false);
  }

  function handleLocalSignOut() {
    clearStoredSession();
    setSession(null);
    setIsOptionsOpen(false);
    setIsCreateAccountIntroOpen(false);
    setIsIntroReplayOpen(false);

    if (!session) return;

    const mutation =
      session.sessionType === "follower" ? followerSignOutMutation : signOutMutation;
    mutation({ token: session.token }).catch(() => {
      // best-effort server-side cleanup when the service is reachable again
    });
  }

  function handleLoggedOut() {
    clearStoredSession();
    setSession(null);
    setIsOptionsOpen(false);
    setIsCreateAccountIntroOpen(false);
    setIsIntroReplayOpen(false);
  }

  function showResetToast(message: string) {
    if (resetToastTimeoutRef.current !== null) {
      clearTimeout(resetToastTimeoutRef.current);
    }
    setResetToastMessage(message);
    resetToastTimeoutRef.current = setTimeout(() => {
      setResetToastMessage(null);
      resetToastTimeoutRef.current = null;
    }, 3600);
  }

  // URL-param screens (no session required)
  if (pendingResetToken) {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="reset" {...PANEL_MOTION}>
          <PasswordResetScreen
            resetToken={pendingResetToken}
            onDone={() => {
              setPendingResetToken(null);
              history.replaceState({}, "", window.location.pathname);
            }}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  if (pendingInviteToken) {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="invite" {...PANEL_MOTION}>
          <InviteRedemptionScreen
            inviteToken={pendingInviteToken}
            onSignIn={(newSession) => handleSignIn(newSession, { playCreateAccountIntro: true })}
            onBack={() => {
              setPendingInviteToken(null);
              history.replaceState({}, "", window.location.pathname);
            }}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  // No session: show login screen
  if (!session) {
    if (showTravelerLogin) {
      return (
        <AnimatePresence mode="wait">
          <motion.div key="traveler-auth" {...PANEL_MOTION}>
            <AuthScreen
              onSignIn={(s) => handleSignIn({ ...s, sessionType: "legacy" })}
              onBack={() => setShowTravelerLogin(false)}
            />
          </motion.div>
        </AnimatePresence>
      );
    }
    return (
      <AnimatePresence mode="wait">
        <motion.div key="follower-login" {...PANEL_MOTION}>
          <FollowerLoginScreen
            onSignIn={handleSignIn}
            onShowTravelerLogin={() => setShowTravelerLogin(true)}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  // Session check still loading
  if (activeSessionCheck === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted/30 px-4">
        <div key={sessionRetryNonce} className="grid max-w-sm gap-4 text-center">
          <PendingNotice
            label="Verifying session..."
            pending={activeSessionCheck === undefined}
            className="text-sm text-muted-foreground"
          />
          {sessionCheckIsDelayed ? (
            <div role="status" className="grid gap-3 rounded-md border bg-background p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">
                {isOnline
                  ? "TripCast is still waiting for the service. Your session is being kept on this device."
                  : "Your browser appears to be offline. Your session is being kept on this device."}
              </p>
              <div className="flex justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSessionRetryNonce((value) => value + 1)}
                >
                  Retry
                </Button>
                <Button type="button" variant="outline" onClick={handleLocalSignOut}>
                  Sign out
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // Session invalidated on server
  if (activeSessionCheck === null) {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="auth-fallback" {...PANEL_MOTION}>
          <FollowerLoginScreen
            onSignIn={handleSignIn}
            onShowTravelerLogin={() => setShowTravelerLogin(true)}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  const role = activeSessionCheck.role;
  const followerHandle =
    session.sessionType === "follower" ? session.username : undefined;

  if (view === "follower-management" && role === "traveler") {
    return (
      <>
        <TravelerThemeBridge token={session.token} role={role} />
        <FeatureBoundary
          resetKeys={[view, session.token]}
          onClose={() => setView("map")}
          title="Follower management hit a problem."
          message="Try again, or go back to the map."
          fallbackClassName="m-4 grid gap-3 rounded-md border bg-background p-4 text-sm shadow-sm"
        >
          <FollowerManagementPage
            token={session.token}
            onBack={() => setView("map")}
          />
        </FeatureBoundary>
      </>
    );
  }

  return (
    <div className="relative flex flex-col h-dvh">
      <TravelerThemeBridge token={session.token} role={role} />
      <div className={isPickerActive ? "invisible pointer-events-none h-0 overflow-hidden" : undefined}>
        <TopBar
          role={role}
          onOpenOptions={() => {
            music.sfx("open");
            setPreserveDebugContext(false);
            setOptionsDefaultView("options");
            setIsOptionsOpen(true);
          }}
        />

        <TripTicker
          message={currentMessage}
          isPriority={isPriority}
          onComplete={onFunFactComplete}
        />
      </div>

      <OptionsSheet
        open={isOptionsOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            music.sfx("close");
            setOptionsDefaultView("options");
            setPreserveDebugContext(false);
          }
          setIsOptionsOpen(nextOpen);
        }}
        defaultView={optionsDefaultView}
        preserveDebugContext={preserveDebugContext}
        session={session}
        role={role}
        onSignOut={handleSignOut}
        onManageFollowers={() => {
          music.sfx("page");
          setIsOptionsOpen(false);
          setView("follower-management");
        }}
        onReplayFollowerTour={() => {
          music.sfx("page");
          setIsOptionsOpen(false);
          setIsIntroReplayOpen(true);
        }}
        onLoggedOut={handleLoggedOut}
        onLocationDataCleared={() => setLocationResetNonce((value) => value + 1)}
        onTripDataDeleted={() => setTripDataResetNonce((value) => value + 1)}
        onResetStarted={showResetToast}
        onEndTrip={role === "traveler" ? () => { setIsOptionsOpen(false); setIsEndTripOpen(true); } : undefined}
        onViewCredits={() => { setIsOptionsOpen(false); setIsCreditsOpen(true); }}
      />

      {role === "traveler" && (
        <EndTripSheet
          token={session.token}
          open={isEndTripOpen}
          onOpenChange={setIsEndTripOpen}
          onViewCredits={() => { setIsEndTripOpen(false); setIsCreditsOpen(true); }}
        />
      )}

      {isCreditsOpen && (
        <CreditsOverlay token={session.token} role={role} onClose={() => setIsCreditsOpen(false)} />
      )}

      <ErrorBoundary
        resetKeys={[session.token, role, locationResetNonce, tripDataResetNonce]}
        onReset={disarmCrash}
        onError={(error, info) => {
          const err = error instanceof Error ? error : null;
          debugLog("error", "App", "react:map-boundary-error", "error", {
            message: err?.message ?? String(error),
            name: err?.name ?? typeof error,
            stack: err?.stack?.slice(0, 400),
            componentStack: info.componentStack?.slice(0, 400),
          });
        }}
        fallbackRender={(props) => <MapErrorFallback {...props} />}
      >
        {/* Dev tool: lets the "Crash App" Option (or window.tripcast.crash()) trip
            this boundary's full-screen fallback. Retry recovers via resetKeys. */}
        <CrashOnDemand />
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full min-h-[200px]">
              Loading map...
            </div>
          }
        >
          <TripMap
            token={session.token}
            role={role}
            locationResetNonce={locationResetNonce}
            tripDataResetNonce={tripDataResetNonce}
            finaleReplayActive={isCreditsOpen}
            onMapLoaded={() => setMapLoaded(true)}
            onPickerActiveChange={setIsPickerActive}
            onOpenDebugPanel={() => {
              music.sfx("open");
              setPreserveDebugContext(true);
              setOptionsDefaultView("debug-logs");
              setIsOptionsOpen(true);
            }}
          />
        </Suspense>
      </ErrorBoundary>

      {isCreateAccountIntroOpen ? (
        <CreateAccountIntroFlow
          token={session.token}
          role={role}
          accountLabel={followerHandle}
          userHandle={followerHandle ?? "you"}
          travelerName="the Traveler"
          onDone={() => setIsCreateAccountIntroOpen(false)}
        />
      ) : null}

      {isIntroReplayOpen ? (
        <IntroSequence
          role={role}
          accountLabel={followerHandle}
          userHandle={followerHandle ?? "you"}
          travelerName="the Traveler"
          source="options-replay"
          onDone={() => {
            markLocalIntroSeen(role, followerHandle);
            setIsIntroReplayOpen(false);
          }}
        />
      ) : null}

      <AnimatePresence>
        {resetToastMessage ? (
          <motion.div
            key="reset-toast"
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" as const }}
            role="status"
            className="fixed left-1/2 top-16 z-[60] max-w-[calc(100%-24px)] -translate-x-1/2 rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-950 shadow-lg dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100"
          >
            {resetToastMessage}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

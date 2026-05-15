import React, { Suspense, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { Settings } from "lucide-react";

import { tripcastApi } from "./convex/tripcastApi";
import {
  clearStoredSession,
  getStoredSession,
  setStoredSession,
  type StoredSession,
} from "./lib/auth";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import AuthScreen from "./features/auth/AuthScreen";
import FollowerLoginScreen from "./features/auth/FollowerLoginScreen";
import InviteRedemptionScreen from "./features/auth/InviteRedemptionScreen";
import PasswordResetScreen from "./features/auth/PasswordResetScreen";
import EmergencyResetSheet from "./features/privacy/EmergencyResetSheet";
import OptionsSheet from "./features/options/OptionsSheet";

const TripMap = React.lazy(() => import("./features/map/TripMap"));

const PANEL_MOTION = {
  initial: { y: 40, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 40, opacity: 0 },
  transition: { duration: 0.18, ease: "easeOut" as const },
};

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
  return <ConnectedApp />;
}

function ConnectedApp() {
  const [inviteToken] = useState(() => new URLSearchParams(window.location.search).get("invite"));
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get("reset"));
  const [showTravelerLogin, setShowTravelerLogin] = useState(false);
  const [pendingInviteToken, setPendingInviteToken] = useState(inviteToken);
  const [pendingResetToken, setPendingResetToken] = useState(resetToken);

  const [session, setSession] = useState<StoredSession | null>(getStoredSession);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isEmergencyResetOpen, setIsEmergencyResetOpen] = useState(false);
  const [locationResetNonce, setLocationResetNonce] = useState(0);
  const [tripDataResetNonce, setTripDataResetNonce] = useState(0);
  const [resetToastMessage, setResetToastMessage] = useState<string | null>(null);
  const resetToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const signOutMutation = useMutation(tripcastApi.auth.signOut);
  const followerSignOutMutation = useMutation(tripcastApi.followers.followerSignOut);

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

  function handleSignIn(newSession: StoredSession) {
    setStoredSession(newSession);
    setSession(newSession);
    setPendingInviteToken(null);
    setPendingResetToken(null);
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
  }

  function handleLoggedOut() {
    clearStoredSession();
    setSession(null);
    setIsEmergencyResetOpen(false);
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
            onSignIn={handleSignIn}
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
            <AuthScreen onSignIn={(s) => handleSignIn({ ...s, sessionType: "legacy" })} />
          </motion.div>
        </AnimatePresence>
      );
    }
    return (
      <AnimatePresence mode="wait">
        <motion.div key="follower-login" {...PANEL_MOTION}>
          <FollowerLoginScreen
            onSignIn={handleSignIn}
            onShowInvite={() => {
              // If no invite token in URL, show a prompt; for now just keep the flow
            }}
            onShowTravelerLogin={() => setShowTravelerLogin(true)}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  // Session check still loading
  if (activeSessionCheck === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted/30">
        <p className="text-sm text-muted-foreground">Verifying session…</p>
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
            onShowInvite={() => {}}
            onShowTravelerLogin={() => setShowTravelerLogin(true)}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  const role = activeSessionCheck.role;
  const roleLabel = role === "traveler" ? "Traveler" : "Support Crew";

  return (
    <div className="relative flex flex-col h-dvh">
      <header className="flex min-h-14 flex-wrap items-center gap-2 border-b bg-background px-4 py-2 z-[2]">
        <h1 className="text-lg font-bold">TripCast</h1>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          <Badge variant="secondary">{roleLabel}</Badge>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setIsOptionsOpen(true)}
            aria-label="Options"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Options
          </Button>
        </div>
      </header>

      <OptionsSheet
        open={isOptionsOpen}
        onOpenChange={setIsOptionsOpen}
        session={session}
        role={role}
        onSignOut={handleSignOut}
        onEmergencyReset={() => setIsEmergencyResetOpen(true)}
      />

      {role === "traveler" ? (
        <EmergencyResetSheet
          open={isEmergencyResetOpen}
          token={session.token}
          onOpenChange={setIsEmergencyResetOpen}
          onLoggedOut={handleLoggedOut}
          onLocationDataCleared={() => setLocationResetNonce((value) => value + 1)}
          onTripDataDeleted={() => setTripDataResetNonce((value) => value + 1)}
          onResetStarted={showResetToast}
        />
      ) : null}

      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full min-h-[200px]">
            Loading map…
          </div>
        }
      >
        <TripMap
          token={session.token}
          role={role}
          locationResetNonce={locationResetNonce}
          tripDataResetNonce={tripDataResetNonce}
        />
      </Suspense>

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

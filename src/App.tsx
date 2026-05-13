import React, { Suspense, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";

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
import EmergencyResetSheet from "./features/privacy/EmergencyResetSheet";

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
  const [session, setSession] = useState<StoredSession | null>(getStoredSession);
  const [isEmergencyResetOpen, setIsEmergencyResetOpen] = useState(false);
  const [locationResetNonce, setLocationResetNonce] = useState(0);
  const [tripDataResetNonce, setTripDataResetNonce] = useState(0);

  const sessionCheck = useQuery(
    tripcastApi.auth.currentSession,
    session !== null ? { token: session.token } : "skip",
  );

  const signOutMutation = useMutation(tripcastApi.auth.signOut);

  useEffect(() => {
    if (session !== null && sessionCheck === null) {
      clearStoredSession();
      setSession(null);
    }
  }, [session, sessionCheck]);

  function handleSignIn(newSession: StoredSession) {
    setStoredSession(newSession);
    setSession(newSession);
  }

  async function handleSignOut() {
    if (session) {
      try {
        await signOutMutation({ token: session.token });
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

  if (!session) {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="auth" {...PANEL_MOTION}>
          <AuthScreen onSignIn={handleSignIn} />
        </motion.div>
      </AnimatePresence>
    );
  }

  if (sessionCheck === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted/30">
        <p className="text-sm text-muted-foreground">Verifying session…</p>
      </div>
    );
  }

  if (sessionCheck === null) {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="auth-fallback" {...PANEL_MOTION}>
          <AuthScreen onSignIn={handleSignIn} />
        </motion.div>
      </AnimatePresence>
    );
  }

  const roleLabel = sessionCheck.role === "traveler" ? "Traveler" : "Support Crew";

  return (
    <div className="flex flex-col h-dvh">
      <header className="flex min-h-14 flex-wrap items-center gap-2 border-b bg-background px-4 py-2 z-[2]">
        <h1 className="text-lg font-bold">TripCast</h1>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          {sessionCheck.role === "traveler" ? (
            <Button
              variant="destructive"
              size="sm"
              type="button"
              onClick={() => setIsEmergencyResetOpen(true)}
            >
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              Emergency Reset
            </Button>
          ) : null}
          <Badge variant="secondary">{roleLabel}</Badge>
          <Button variant="ghost" size="sm" type="button" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </header>
      {sessionCheck.role === "traveler" ? (
        <EmergencyResetSheet
          open={isEmergencyResetOpen}
          token={session.token}
          onOpenChange={setIsEmergencyResetOpen}
          onLoggedOut={handleLoggedOut}
          onLocationDataCleared={() => setLocationResetNonce((value) => value + 1)}
          onTripDataDeleted={() => setTripDataResetNonce((value) => value + 1)}
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
          role={sessionCheck.role}
          locationResetNonce={locationResetNonce}
          tripDataResetNonce={tripDataResetNonce}
        />
      </Suspense>
    </div>
  );
}

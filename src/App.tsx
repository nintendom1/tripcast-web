import React, { Suspense, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { tripcastApi } from "./convex/tripcastApi";
import {
  clearStoredSession,
  getStoredSession,
  setStoredSession,
  type StoredSession,
} from "./lib/auth";
import AuthScreen from "./features/auth/AuthScreen";

const TripMap = React.lazy(() => import("./features/map/TripMap"));

type AppProps = {
  convexReady: boolean;
};

export default function App({ convexReady }: AppProps) {
  if (!convexReady) {
    return (
      <main className="app-shell">
        <header className="app-header">
          <h1>TripCast</h1>
        </header>
        <div className="setup-message">
          <p>
            <strong>VITE_CONVEX_URL is not set.</strong> Configure Convex to use TripCast.
          </p>
        </div>
      </main>
    );
  }
  return <ConnectedApp />;
}

function ConnectedApp() {
  const [session, setSession] = useState<StoredSession | null>(getStoredSession);

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

  if (!session) {
    return <AuthScreen onSignIn={handleSignIn} />;
  }

  if (sessionCheck === undefined) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="auth-subtitle">Verifying session…</p>
        </div>
      </div>
    );
  }

  if (sessionCheck === null) {
    return <AuthScreen onSignIn={handleSignIn} />;
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>TripCast</h1>
        <div className="header-actions">
          <span className="header-role">
            {sessionCheck.role === "traveler" ? "Traveler" : "Support Crew"}
          </span>
          <button className="sign-out-button" type="button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>
      <Suspense fallback={<div className="map-loading">Loading map…</div>}>
        <TripMap token={session.token} role={sessionCheck.role} />
      </Suspense>
    </main>
  );
}

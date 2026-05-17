import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { StoredSession } from "../../lib/auth";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PendingActionNotice } from "../../components/resilience/PendingActionNotice";

type FollowerLoginScreenProps = {
  onSignIn: (session: StoredSession) => void;
  onShowTravelerLogin: () => void;
};

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("locked") || lower.includes("lockout")) {
    return "Too many failed attempts. Try again in 15 minutes.";
  }
  if (lower.includes("too many") || lower.includes("rate")) {
    return "Too many attempts. Try again later.";
  }
  if (lower.includes("banned")) {
    return "This account is not available.";
  }
  if (lower.includes("revoked") || lower.includes("membership")) {
    return "Access to this trip has been revoked.";
  }
  return "Incorrect username or password.";
}

export default function FollowerLoginScreen({
  onSignIn,
  onShowTravelerLogin,
}: FollowerLoginScreenProps) {
  const signIn = useMutation(tripcastApi.followers.followerSignIn);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isPending) return;
    setError(null);
    setIsPending(true);
    try {
      const result = await signIn({ username: username.trim(), password, rememberMe });
      onSignIn({
        token: result.token,
        role: "support_crew",
        sessionType: "follower",
        username: username.trim(),
      });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 px-4 py-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-2xl text-center">TripCast</CardTitle>
          <p className="text-sm text-muted-foreground text-center">Sign in to view this trip</p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1.5 font-medium text-sm">
              Username
              <Input
                autoFocus
                autoComplete="username"
                disabled={isPending}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your-username"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 font-medium text-sm">
              Password
              <Input
                autoComplete="current-password"
                disabled={isPending}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
              />
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isPending}
                className="h-4 w-4"
              />
              Remember me for 30 days
            </label>
            {error ? (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2"
              >
                {error}
              </p>
            ) : null}
            <PendingActionNotice isPending={isPending} actionLabel="sign-in" />
            <Button disabled={isPending || !username.trim() || !password} type="submit">
              {isPending ? "Signing in…" : "Sign in"}
            </Button>
            <button
              type="button"
              className="text-xs text-muted-foreground/70 text-center underline-offset-4 hover:underline"
              onClick={onShowTravelerLogin}
            >
              Sign in as Traveler
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { StoredSession } from "../../lib/auth";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { PendingActionNotice } from "../../components/resilience/PendingActionNotice";
import AuthShell from "./AuthShell";

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
        role: "follower",
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
    <AuthShell
      kicker="Follower"
      subtitle="Sign in to follow this trip."
      footer={
        <button
          type="button"
          className="font-[var(--font-mono)] text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] underline-offset-4 hover:text-[var(--ink-1)] hover:underline"
          onClick={onShowTravelerLogin}
        >
          Sign in as Traveler
        </button>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
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
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
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
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ink-2)]">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            disabled={isPending}
            className="h-4 w-4"
            style={{ accentColor: "var(--flag)" }}
          />
          Remember me for 30 days
        </label>
        {error ? (
          <p
            role="alert"
            className="rounded-md border px-3 py-2 text-sm"
            style={{
              borderColor: "color-mix(in oklab, var(--danger) 25%, transparent)",
              background: "color-mix(in oklab, var(--danger) 10%, transparent)",
              color: "var(--danger)",
            }}
          >
            {error}
          </p>
        ) : null}
        <PendingActionNotice isPending={isPending} actionLabel="sign-in" />
        <Button disabled={isPending || !username.trim() || !password} type="submit">
          {isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}

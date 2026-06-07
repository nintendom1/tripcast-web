import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { getClientId } from "../../lib/clientId";
import type { StoredSession } from "../../lib/auth";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { PendingActionNotice } from "../../components/resilience/PendingActionNotice";
import { cn } from "../../lib/utils";
type AuthScreenProps = {
  onSignIn: (session: Omit<StoredSession, "sessionType" | "displayName" | "username">) => void;
  onBack?: () => void;
};

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("too many") || message.toLowerCase().includes("rate")) {
    return "Too many attempts. Try again later.";
  }
  if (message.toLowerCase().includes("invalid code")) {
    return "Incorrect code. Please try again.";
  }
  return "Sign-in failed. Please try again.";
}

export default function AuthScreen({ onSignIn, onBack }: AuthScreenProps) {
  const signIn = useMutation(tripcastApi.auth.signIn);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    setError(null);
    setIsPending(true);

    try {
      const result = await signIn({
        role: "traveler",
        code: code.trim(),
        clientId: getClientId(),
      });
      if (!result.ok) {
        setError("Incorrect code. Please try again.");
        return;
      }
      onSignIn({ token: result.token, role: result.role });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1.5 text-center mb-2">
        <span className="font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-3)]">
          Traveler
        </span>
        <h1 className="font-[var(--font-display)] text-2xl font-extrabold tracking-tight text-[var(--ink-1)]">
          Sign In
        </h1>
        <p className="text-sm text-[var(--ink-2)]">Sign in with the code your trip uses.</p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
          Traveler code
          <Input
            autoFocus
            autoComplete="one-time-code"
            disabled={isPending}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter code"
            required
            type="password"
            value={code}
          />
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
        <div className="flex justify-end gap-2">
          {onBack ? (
            <Button disabled={isPending} type="button" variant="outline" onClick={onBack}>
              Back
            </Button>
          ) : null}
          <Button disabled={isPending || code.trim().length === 0} type="submit">
            {isPending ? "Signing in…" : "Sign in"}
          </Button>
        </div>
      </form>
    </div>
  );
}

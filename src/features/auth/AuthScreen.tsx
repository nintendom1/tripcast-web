import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { getClientId } from "../../lib/clientId";
import type { StoredSession } from "../../lib/auth";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PendingActionNotice } from "../../components/resilience/PendingActionNotice";

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
      onSignIn({ token: result.token, role: result.role });
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
          <p className="text-sm text-muted-foreground text-center">Traveler sign-in</p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1.5 font-medium text-sm">
              Traveler code
              <Input
                autoFocus
                autoComplete="off"
                disabled={isPending}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter code"
                required
                type="password"
                value={code}
              />
            </label>
            {error ? (
              <p role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2">
                {error}
              </p>
            ) : null}
            <PendingActionNotice isPending={isPending} actionLabel="sign-in" />
            <div className="flex gap-2 justify-end">
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
        </CardContent>
      </Card>
    </div>
  );
}

import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";

import { tripcastApi, type Role } from "../../convex/tripcastApi";
import { getClientId } from "../../lib/clientId";
import type { StoredSession } from "../../lib/auth";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

type AuthScreenProps = {
  onSignIn: (session: StoredSession) => void;
};

type RoleView = Role | null;

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

type CodeFormProps = {
  role: Role;
  onSignIn: (session: StoredSession) => void;
  onBack: () => void;
};

function CodeForm({ role, onSignIn, onBack }: CodeFormProps) {
  const signIn = useMutation(tripcastApi.auth.signIn);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const label = role === "traveler" ? "Traveler code" : "Support crew code";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    setError(null);
    setIsPending(true);

    try {
      const result = await signIn({
        role,
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
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <h2 className="text-lg font-semibold">
        {role === "traveler" ? "Traveler" : "Support Crew"}
      </h2>
      <label className="flex flex-col gap-1.5 font-medium text-sm">
        {label}
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
      <div className="flex gap-2 justify-end">
        <Button disabled={isPending} type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button disabled={isPending || code.trim().length === 0} type="submit">
          {isPending ? "Signing in…" : "Sign in"}
        </Button>
      </div>
    </form>
  );
}

export default function AuthScreen({ onSignIn }: AuthScreenProps) {
  const [roleView, setRoleView] = useState<RoleView>(null);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 px-4 py-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-2xl text-center">TripCast</CardTitle>
          {!roleView && (
            <p className="text-sm text-muted-foreground text-center">Who are you?</p>
          )}
        </CardHeader>
        <CardContent>
          {roleView ? (
            <CodeForm role={roleView} onSignIn={onSignIn} onBack={() => setRoleView(null)} />
          ) : (
            <div className="flex flex-col gap-3">
              <button
                className="flex flex-col items-start gap-0.5 rounded-lg border bg-muted/50 px-4 py-3.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                type="button"
                onClick={() => setRoleView("traveler")}
              >
                <span className="text-sm font-semibold">Traveler</span>
                <span className="text-xs text-muted-foreground">Add and view checkpoints</span>
              </button>
              <button
                className="flex flex-col items-start gap-0.5 rounded-lg border bg-muted/50 px-4 py-3.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                type="button"
                onClick={() => setRoleView("support_crew")}
              >
                <span className="text-sm font-semibold">Support Crew</span>
                <span className="text-xs text-muted-foreground">View checkpoints only</span>
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

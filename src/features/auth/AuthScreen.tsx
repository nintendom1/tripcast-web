import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";

import { tripcastApi, type Role } from "../../convex/tripcastApi";
import { getClientId } from "../../lib/clientId";
import type { StoredSession } from "../../lib/auth";

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
    <form className="auth-form" onSubmit={handleSubmit}>
      <h2>{role === "traveler" ? "Traveler" : "Support Crew"}</h2>
      <label>
        {label}
        <input
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
      {error ? <p className="form-error">{error}</p> : null}
      <div className="auth-form-actions">
        <button disabled={isPending} type="button" onClick={onBack}>
          Back
        </button>
        <button disabled={isPending || code.trim().length === 0} type="submit">
          {isPending ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </form>
  );
}

export default function AuthScreen({ onSignIn }: AuthScreenProps) {
  const [roleView, setRoleView] = useState<RoleView>(null);

  if (roleView) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1 className="auth-title">TripCast</h1>
          <CodeForm role={roleView} onSignIn={onSignIn} onBack={() => setRoleView(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-title">TripCast</h1>
        <p className="auth-subtitle">Who are you?</p>
        <div className="auth-role-buttons">
          <button
            className="auth-role-button"
            type="button"
            onClick={() => setRoleView("traveler")}
          >
            <span className="auth-role-label">Traveler</span>
            <span className="auth-role-desc">Add and view checkpoints</span>
          </button>
          <button
            className="auth-role-button"
            type="button"
            onClick={() => setRoleView("support_crew")}
          >
            <span className="auth-role-label">Support Crew</span>
            <span className="auth-role-desc">View checkpoints only</span>
          </button>
        </div>
      </div>
    </div>
  );
}

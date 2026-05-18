import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { StoredSession } from "../../lib/auth";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { PendingActionNotice } from "../../components/resilience/PendingActionNotice";
import AuthShell from "./AuthShell";

const TERMS_VERSION = "1.0";
const PRIVACY_VERSION = "1.0";

type InviteRedemptionScreenProps = {
  inviteToken: string;
  onSignIn: (session: StoredSession) => void;
  onBack: () => void;
};

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("expired")) return "This invite has expired. Ask the traveler for a new one.";
  if (lower.includes("used") || lower.includes("redeemed")) return "This invite has already been used.";
  if (lower.includes("invalid") || lower.includes("not found")) return "Invalid invite link.";
  if (lower.includes("taken") || lower.includes("unique") || lower.includes("already")) {
    return "That username is already taken. Please choose another.";
  }
  if (lower.includes("too many") || lower.includes("rate")) return "Too many attempts. Try again later.";
  return "Failed to create account. Please try again.";
}

export default function InviteRedemptionScreen({
  inviteToken,
  onSignIn,
  onBack,
}: InviteRedemptionScreenProps) {
  const redeemInvite = useMutation(tripcastApi.followers.redeemInvite);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit =
    username.trim().length >= 3 &&
    password.length >= 8 &&
    password === confirmPassword &&
    termsAccepted &&
    !isPending;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsPending(true);
    try {
      const result = await redeemInvite({
        inviteToken,
        username: username.trim(),
        password,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      });
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
    <AuthShell
      kicker="Invite"
      title="Create account"
      subtitle="You've been invited to follow this trip."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
          Username
          <Input
            autoFocus
            autoComplete="username"
            disabled={isPending}
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="at least 3 characters"
            required
            minLength={3}
          />
          <span className="text-xs text-[var(--ink-3)]">Letters, numbers, - and _ only</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
          Password
          <Input
            autoComplete="new-password"
            disabled={isPending}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={8}
          />
          <span className="text-xs text-[var(--ink-3)]">At least 8 characters</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
          Confirm password
          <Input
            autoComplete="new-password"
            disabled={isPending}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            type="password"
            required
          />
          {passwordMismatch ? (
            <span className="text-xs" style={{ color: "var(--danger)" }}>
              Passwords do not match
            </span>
          ) : null}
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--ink-2)]">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            disabled={isPending}
            className="mt-0.5 h-4 w-4"
            style={{ accentColor: "var(--flag)" }}
            required
          />
          I agree to the terms of service and privacy policy
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
        <PendingActionNotice isPending={isPending} actionLabel="account creation" />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={onBack}
            className="flex-1"
          >
            Back
          </Button>
          <Button type="submit" disabled={!canSubmit} className="flex-1">
            {isPending ? "Creating…" : "Create account"}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}

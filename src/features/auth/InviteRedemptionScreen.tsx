import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { StoredSession } from "../../lib/auth";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

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
  const [displayName, setDisplayName] = useState("");
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
    displayName.trim().length > 0 &&
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
        displayName: displayName.trim(),
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      });
      onSignIn({
        token: result.token,
        role: "support_crew",
        sessionType: "follower",
        username: username.trim(),
        displayName: displayName.trim(),
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
          <CardTitle className="text-2xl text-center">Create Account</CardTitle>
          <p className="text-sm text-muted-foreground text-center">
            You have been invited to follow this trip
          </p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1.5 font-medium text-sm">
              Display name
              <Input
                autoFocus
                autoComplete="name"
                disabled={isPending}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 font-medium text-sm">
              Username
              <Input
                autoComplete="username"
                disabled={isPending}
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="at least 3 characters"
                required
                minLength={3}
              />
              <span className="text-xs text-muted-foreground">
                Letters, numbers, - and _ only
              </span>
            </label>
            <label className="flex flex-col gap-1.5 font-medium text-sm">
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
              <span className="text-xs text-muted-foreground">At least 8 characters</span>
            </label>
            <label className="flex flex-col gap-1.5 font-medium text-sm">
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
                <span className="text-xs text-destructive">Passwords do not match</span>
              ) : null}
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                disabled={isPending}
                className="mt-0.5 h-4 w-4"
                required
              />
              I agree to the terms of service and privacy policy
            </label>
            {error ? (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2"
              >
                {error}
              </p>
            ) : null}
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
        </CardContent>
      </Card>
    </div>
  );
}

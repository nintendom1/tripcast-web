import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

type PasswordResetScreenProps = {
  resetToken: string;
  onDone: () => void;
};

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("expired")) {
    return "This reset link has expired. Ask the traveler for a new one.";
  }
  if (lower.includes("used") || lower.includes("already")) {
    return "This reset link has already been used.";
  }
  if (lower.includes("invalid") || lower.includes("not found")) {
    return "Invalid reset link.";
  }
  return "Password reset failed. Please try again.";
}

export default function PasswordResetScreen({ resetToken, onDone }: PasswordResetScreenProps) {
  const consumePasswordReset = useMutation(tripcastApi.passwordReset.consumePasswordReset);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit = password.length >= 8 && password === confirmPassword && !isPending;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsPending(true);
    try {
      await consumePasswordReset({ resetToken, newPassword: password });
      setIsDone(true);
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
          <CardTitle className="text-2xl text-center">Reset Password</CardTitle>
        </CardHeader>
        <CardContent>
          {isDone ? (
            <div className="flex flex-col gap-4 text-center">
              <p className="text-sm text-muted-foreground">
                Password updated. You can now sign in with your new password.
              </p>
              <Button type="button" onClick={onDone}>
                Sign in
              </Button>
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-1.5 font-medium text-sm">
                New password
                <Input
                  autoFocus
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
                Confirm new password
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
              {error ? (
                <p
                  role="alert"
                  className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2"
                >
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={!canSubmit}>
                {isPending ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { motion, useReducedMotion } from "framer-motion";
import { Flag } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { StoredSession } from "../../lib/auth";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { PendingActionNotice } from "../../components/resilience/PendingActionNotice";
import { cn } from "../../lib/utils";
import { useTheme } from "../../providers/ThemeProvider";
import { FeatureShowcase } from "./FeatureShowcase";
import AuthShell from "./AuthShell";
import { IntroBackdrop, SceneCard } from "../onboarding/IntroScenes";
import termsCopy from "./legal/tos.txt?raw";
import privacyCopy from "./legal/privacypolicy.txt?raw";

const TERMS_VERSION = "1.0";
const PRIVACY_VERSION = "1.0";
const USERNAME_PATTERN = /^[a-z0-9_-]+$/;
type LegalDocument = "terms" | "privacy";

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

function getUsernameValidationMessage(rawUsername: string): string | null {
  const username = rawUsername.trim();
  if (username.length === 0) return null;
  if (username.length < 3 || username.length > 30) {
    return "Username must be 3 to 30 characters.";
  }
  if (!USERNAME_PATTERN.test(username)) {
    return "Username may only contain letters, numbers, underscores, and hyphens.";
  }
  return null;
}

export default function InviteRedemptionScreen({
  inviteToken,
  onSignIn,
  onBack,
}: InviteRedemptionScreenProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "constellation";
  const reduceMotion = useReducedMotion();
  const inviteStatus = useQuery(tripcastApi.followers.getInviteStatus, { inviteToken });
  const redeemInvite = useMutation(tripcastApi.followers.redeemInvite);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [openLegalDocument, setOpenLegalDocument] = useState<LegalDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const normalizedUsername = username.trim();
  const usernameValidationMessage = getUsernameValidationMessage(username);
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit =
    normalizedUsername.length >= 3 &&
    usernameValidationMessage === null &&
    password.length >= 8 &&
    password === confirmPassword &&
    termsAccepted &&
    !isPending;

  if (inviteStatus === undefined) {
    return (
      <AuthShell kicker="Invite" title="Checking invite…">
        <div className="flex flex-col items-center justify-center py-8">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line-soft)] border-t-[var(--flag)]"
            role="status"
            aria-label="Checking invite status"
          />
        </div>
      </AuthShell>
    );
  }

  if (inviteStatus.status !== "valid") {
    let title = "Invite expired";
    let message = "This invite link has expired. Please ask the traveler for a new one.";

    if (inviteStatus.status === "already_used") {
      title = "Invite used";
      message = "This invite link has already been used to create an account.";
    } else if (inviteStatus.status === "invalid") {
      title = "Invalid link";
      message = "This invite link is invalid or no longer exists.";
    }

    return (
      <AuthShell kicker="Invite" title={title}>
        <div className="flex flex-col gap-4">
          <p className="text-center text-sm text-[var(--ink-2)]">{message}</p>
        </div>
      </AuthShell>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsPending(true);
    try {
      const result = await redeemInvite({
        inviteToken,
        username: normalizedUsername,
        password,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      });
      onSignIn({
        token: result.token,
        role: "follower",
        sessionType: "follower",
        username: normalizedUsername,
      });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div
      className={cn(
        "min-h-dvh font-sans transition-colors duration-500",
        isDark
          ? "bg-[var(--bg-paper)] text-[var(--ink-1)]"
          : "bg-[var(--meadow-bg)] text-[var(--meadow-ink)]",
      )}
    >
      <section className="relative overflow-hidden px-4 pb-10 pt-6 sm:px-6">
        <IntroBackdrop
          beat={5}
          isDark={isDark}
          reduceMotion={Boolean(reduceMotion)}
          showStars={isDark}
        />
        <div className="relative z-[1] mx-auto grid max-w-6xl gap-8 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(320px,420px)_1fr] lg:items-center">
          <motion.div
            data-registration-form-panel
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.45, ease: "easeOut" }}
            className="w-full max-w-[420px] justify-self-center lg:justify-self-start"
          >
            <div className="mb-4 flex flex-col items-center gap-1.5 text-center">
              <RegistrationBrandMark isDark={isDark} />
              <span
                className={cn(
                  "font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.16em]",
                  isDark ? "text-[var(--ink-3)]" : "text-[var(--meadow-ink-soft)]",
                )}
              >
                Invite
              </span>
              <h1 className="font-[var(--meadow-font-display)] text-3xl font-extrabold leading-tight">
                Create account
              </h1>
              <p
                className={cn(
                  "max-w-xs text-sm leading-6",
                  isDark ? "text-[var(--ink-2)]" : "text-[var(--meadow-ink-soft)]",
                )}
              >
                You've been invited to follow this trip.
              </p>
            </div>

            <div
              className={cn(
                "rounded-2xl border p-5 shadow-[var(--shadow-card)]",
                isDark
                  ? "border-[var(--ink-3)] bg-[var(--bg-card)]"
                  : "border-[var(--meadow-paper-edge)] bg-[var(--bg-card)]",
              )}
            >
              <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
                  Username
                  <Input
                    autoFocus
                    autoComplete="username"
                    disabled={isPending}
                    id="registration-username"
                    name="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    placeholder="at least 3 characters"
                    required
                    minLength={3}
                    maxLength={30}
                    pattern="[a-z0-9_-]+"
                    aria-invalid={usernameValidationMessage ? true : undefined}
                    aria-describedby="username-help username-error"
                  />
                  <span id="username-help" className="text-xs text-[var(--ink-3)]">
                    Letters, numbers, - and _ only
                  </span>
                  {usernameValidationMessage ? (
                    <span id="username-error" className="text-xs" style={{ color: "var(--danger)" }}>
                      {usernameValidationMessage}
                    </span>
                  ) : null}
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
                  Password
                  <Input
                    autoComplete="new-password"
                    disabled={isPending}
                    id="registration-password"
                    name="password"
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
                    id="registration-confirm-password"
                    name="confirm-password"
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
                <div className="flex items-start gap-2 text-sm text-[var(--ink-2)]">
                  <input
                    id="terms-accepted"
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    disabled={isPending}
                    className="mt-0.5 h-4 w-4"
                    style={{ accentColor: "var(--flag)" }}
                    aria-label="I agree to the terms of service and privacy policy"
                    required
                  />
                  <span>
                    <label htmlFor="terms-accepted" className="cursor-pointer">
                      I agree to the
                    </label>{" "}
                    <button
                      type="button"
                      onClick={() => setOpenLegalDocument("terms")}
                      className="font-semibold underline decoration-[var(--flag)] underline-offset-2"
                    >
                      terms of service
                    </button>{" "}
                    <label htmlFor="terms-accepted" className="cursor-pointer">
                      and
                    </label>{" "}
                    <button
                      type="button"
                      onClick={() => setOpenLegalDocument("privacy")}
                      className="font-semibold underline decoration-[var(--flag)] underline-offset-2"
                    >
                      privacy policy
                    </button>
                  </span>
                </div>
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
            </div>
          </motion.div>

          <motion.div
            data-registration-intro-panel
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : 0.12, duration: reduceMotion ? 0 : 0.5 }}
            className="grid gap-5 text-center lg:text-left"
          >
            <div className="grid gap-3">
              <h2 className="font-[var(--meadow-font-display)] text-4xl font-extrabold leading-[1.08] sm:text-5xl">
                Follow the{" "}
                <span style={{ color: isDark ? "var(--flag)" : "var(--meadow-primary)" }}>
                  Traveler
                </span>
              </h2>
              <p
                className={cn(
                  "mx-auto max-w-xl text-base leading-7 lg:mx-0",
                  isDark ? "text-[var(--ink-2)]" : "text-[var(--meadow-ink-soft)]",
                )}
              >
                Once your account is ready, TripCast gives you the map, posts, suggestions,
                votes, and badges for this traveler in one place.
              </p>
            </div>
            <div className="mx-auto h-52 w-full max-w-lg sm:h-60 md:h-64 lg:mx-0">
              <SceneCard beat={5} isDark={isDark} reduceMotion={Boolean(reduceMotion)} />
            </div>
          </motion.div>
        </div>
      </section>

      <main
        data-registration-features
        className="mx-auto max-w-5xl px-4 pb-12 pt-8 sm:px-6 md:pt-10"
      >
        <FeatureShowcase isDark={isDark} reduceMotion={reduceMotion} />
      </main>

      {openLegalDocument ? (
        <LegalDocumentModal
          title={openLegalDocument === "terms" ? "Terms of Service" : "Privacy Policy"}
          body={openLegalDocument === "terms" ? termsCopy : privacyCopy}
          onClose={() => setOpenLegalDocument(null)}
        />
      ) : null}
    </div>
  );
}

function RegistrationBrandMark({ isDark }: { isDark: boolean }) {
  return (
    <span
      className="grid h-12 w-12 place-items-center rounded-2xl text-white shadow-[var(--shadow-card)]"
      style={{ background: isDark ? "var(--flag)" : "var(--meadow-primary)" }}
      aria-hidden="true"
    >
      <Flag className="h-6 w-6" strokeWidth={2.5} />
    </span>
  );
}

function LegalDocumentModal({
  title,
  body,
  onClose,
}: {
  title: string;
  body: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 py-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-document-title"
        className="flex max-h-[82dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-paper)] shadow-[var(--shadow-sheet)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line-soft)] px-5 py-4">
          <h2 id="legal-document-title" className="font-[var(--font-display)] text-xl font-extrabold text-[var(--ink-1)]">
            {title}
          </h2>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-[var(--ink-2)]">
            {body}
          </pre>
        </div>
      </section>
    </div>
  );
}

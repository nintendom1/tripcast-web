import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Check, Copy, Link } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";

const INVITE_DISMISS_MS = 60_000;
const DEFAULT_PUBLIC_APP_URL = "https://nintendom1.github.io/tripcast-web/";
const invitePanelClass = "flex items-center gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2";
const inviteErrorClass = "rounded-md border border-[var(--ink-danger)] bg-[var(--bg-danger)] px-3 py-2 text-xs text-[var(--ink-danger)]";

type CreateInviteControlProps = {
  token: string;
};

function ensureTrailingSlash(url: string) {
  return url.endsWith("/") ? url : `${url}/`;
}

function getPublicAppUrl() {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  if (configured) return ensureTrailingSlash(configured);

  if (import.meta.env.PROD && import.meta.env.BASE_URL === "./") {
    return DEFAULT_PUBLIC_APP_URL;
  }

  return ensureTrailingSlash(new URL(import.meta.env.BASE_URL, window.location.origin).toString());
}

function buildInviteUrl(inviteToken: string) {
  const inviteUrl = new URL(getPublicAppUrl());
  inviteUrl.searchParams.set("invite", inviteToken);
  return inviteUrl.toString();
}

export default function CreateInviteControl({ token }: CreateInviteControlProps) {
  const createInvite = useMutation(tripcastApi.followerAdmin.createInvite);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!inviteUrl) return;
    const timeout = setTimeout(() => setInviteUrl(null), INVITE_DISMISS_MS);
    return () => clearTimeout(timeout);
  }, [inviteUrl]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  function clearCopiedTimer() {
    if (copiedTimerRef.current !== null) {
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    }
  }

  function showCopied() {
    clearCopiedTimer();
    setCopied(true);
    copiedTimerRef.current = setTimeout(() => {
      setCopied(false);
      copiedTimerRef.current = null;
    }, 2000);
  }

  async function handleCreate() {
    if (isPending) return;
    setError(null);
    setIsPending(true);
    try {
      const result = await createInvite({ token });
      setInviteUrl(buildInviteUrl(result.inviteToken));
      clearCopiedTimer();
      setCopied(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        message.toLowerCase().includes("rate")
          ? "Too many invites created. Try again later."
          : "Failed to create invite.",
      );
    } finally {
      setIsPending(false);
    }
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    setError(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(inviteUrl);
      showCopied();
    } catch {
      clearCopiedTimer();
      setCopied(false);
      setError("Clipboard unavailable. Select and copy the invite link manually.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {inviteUrl ? (
        <div className="flex flex-col gap-2">
          <div className={invitePanelClass}>
            <Link className="h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" aria-hidden />
            <span className="flex-1 break-all font-mono text-xs text-[var(--ink-1)]">{inviteUrl}</span>
          </div>
          <Button size="sm" variant="outline" type="button" onClick={handleCopy}>
            {copied ? (
              <Check className="h-3.5 w-3.5 mr-1.5" />
            ) : (
              <Copy className="h-3.5 w-3.5 mr-1.5" />
            )}
            {copied ? "Copied!" : "Copy invite link"}
          </Button>
          <p className="text-xs text-[var(--ink-3)]">
            Expires in 24 hours. Link clears automatically after 1 minute.
          </p>
        </div>
      ) : (
        <Button size="sm" variant="outline" type="button" disabled={isPending} onClick={handleCreate}>
          {isPending ? "Creating…" : "Create Invite Link"}
        </Button>
      )}
      {error ? (
        <p role="alert" className={inviteErrorClass}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

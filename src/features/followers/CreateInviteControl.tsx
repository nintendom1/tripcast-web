import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Check, Copy, Link } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";

const INVITE_DISMISS_MS = 60_000;

type CreateInviteControlProps = {
  token: string;
};

export default function CreateInviteControl({ token }: CreateInviteControlProps) {
  const createInvite = useMutation(tripcastApi.followerAdmin.createInvite);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteUrl) return;
    const timeout = setTimeout(() => setInviteUrl(null), INVITE_DISMISS_MS);
    return () => clearTimeout(timeout);
  }, [inviteUrl]);

  async function handleCreate() {
    if (isPending) return;
    setError(null);
    setIsPending(true);
    try {
      const result = await createInvite({ token });
      const url = `${window.location.origin}?invite=${result.inviteToken}`;
      setInviteUrl(url);
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
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-2">
      {inviteUrl ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
            <Link className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex-1 font-mono text-xs break-all">{inviteUrl}</span>
          </div>
          <Button size="sm" variant="outline" type="button" onClick={handleCopy}>
            {copied ? (
              <Check className="h-3.5 w-3.5 mr-1.5" />
            ) : (
              <Copy className="h-3.5 w-3.5 mr-1.5" />
            )}
            {copied ? "Copied!" : "Copy invite link"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Expires in 24 hours. Link clears automatically after 1 minute.
          </p>
        </div>
      ) : (
        <Button size="sm" variant="outline" type="button" disabled={isPending} onClick={handleCreate}>
          {isPending ? "Creating…" : "Create Invite Link"}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

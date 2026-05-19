import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { tripcastApi, type FollowerInfo } from "../../convex/tripcastApi";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PendingNotice } from "../../components/resilience/PendingNotice";

type FollowerManagementPanelProps = {
  token: string;
};

type ConfirmAction = {
  type: "ban" | "unban" | "reset" | "delete";
  userId: string;
  username: string;
} | null;

export default function FollowerManagementPanel({ token }: FollowerManagementPanelProps) {
  const followers = useQuery(tripcastApi.followerAdmin.listFollowers, { token });
  const banUser = useMutation(tripcastApi.followerAdmin.banUser);
  const unbanUser = useMutation(tripcastApi.followerAdmin.unbanUser);
  const issuePasswordReset = useMutation(tripcastApi.followerAdmin.issuePasswordReset);
  const deleteFollowerAccount = useMutation(tripcastApi.followerAdmin.deleteFollowerAccount);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [resetForUserId, setResetForUserId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  async function handleConfirm() {
    if (!confirmAction || isPending) return;
    setError(null);
    setIsPending(true);
    try {
      const { type, userId } = confirmAction;
      if (type === "ban") {
        await banUser({ token, userId });
      } else if (type === "unban") {
        await unbanUser({ token, userId });
      } else if (type === "delete") {
        await deleteFollowerAccount({ token, userId });
      } else if (type === "reset") {
        const result = await issuePasswordReset({ token, userId });
        const url = `${window.location.origin}?reset=${result.resetToken}`;
        setResetUrl(url);
        setResetForUserId(userId);
        clearCopiedTimer();
        setCopied(false);
      }
      setConfirmAction(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        msg.toLowerCase().includes("rate")
          ? "Too many actions. Try again later."
          : "Action failed. Please try again.",
      );
    } finally {
      setIsPending(false);
    }
  }

  async function handleCopyReset() {
    if (!resetUrl) return;
    await navigator.clipboard.writeText(resetUrl);
    showCopied();
  }

  if (followers === undefined) {
    return (
      <PendingNotice label="Loading followers..." />
    );
  }

  if (followers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No followers yet. Create an invite link to get started.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2"
        >
          {error}
        </p>
      ) : null}

      {resetUrl && resetForUserId ? (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/50 p-3">
          <p className="text-sm font-medium">Password reset link</p>
          <span className="font-mono text-xs break-all">{resetUrl}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" type="button" onClick={handleCopyReset}>
              {copied ? "Copied!" : "Copy link"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => {
                setResetUrl(null);
                setResetForUserId(null);
                clearCopiedTimer();
                setCopied(false);
              }}
            >
              Dismiss
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Expires in 24 hours.</p>
        </div>
      ) : null}

      {confirmAction ? (
        <ConfirmationCard
          action={confirmAction}
          isPending={isPending}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      ) : null}

      <ul className="flex flex-col divide-y">
        {followers.map((follower) => (
          <FollowerRow
            key={follower.userId}
            follower={follower}
            onAction={setConfirmAction}
          />
        ))}
      </ul>
    </div>
  );
}

function FollowerRow({
  follower,
  onAction,
}: {
  follower: FollowerInfo;
  onAction: (action: ConfirmAction) => void;
}) {
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate">{follower.displayName}</span>
          <span className="text-xs text-muted-foreground">@{follower.username}</span>
        </div>
        {follower.isBanned ? (
          <Badge variant="destructive" className="text-xs shrink-0">
            Banned
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {follower.isBanned ? (
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={() =>
              onAction({ type: "unban", userId: follower.userId, username: follower.username })
            }
          >
            Unban
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={() =>
              onAction({ type: "ban", userId: follower.userId, username: follower.username })
            }
          >
            Ban
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={() =>
            onAction({ type: "reset", userId: follower.userId, username: follower.username })
          }
        >
          Issue reset
        </Button>
        <Button
          size="sm"
          variant="outline"
          type="button"
          className="border-rose-300 text-rose-800 hover:bg-rose-50 hover:text-rose-900 dark:text-rose-200 dark:hover:bg-rose-950/40"
          onClick={() =>
            onAction({ type: "delete", userId: follower.userId, username: follower.username })
          }
        >
          Delete
        </Button>
      </div>
    </li>
  );
}

const CONFIRM_MESSAGES: Record<string, (username: string) => string> = {
  ban: (u) => `Ban @${u}? Their account will be immediately blocked.`,
  unban: (u) => `Unban @${u}?`,
  reset: (u) => `Issue a password reset for @${u}? You will get a link to share with them.`,
  delete: (u) => `Permanently delete @${u}'s account? This cannot be undone.`,
};

function ConfirmationCard({
  action,
  isPending,
  onConfirm,
  onCancel,
}: {
  action: NonNullable<ConfirmAction>;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isDestructive = action.type === "delete" || action.type === "ban";
  const message = CONFIRM_MESSAGES[action.type]?.(action.username) ?? "Are you sure?";

  return (
    <div className="rounded-md border bg-muted/30 p-3 flex flex-col gap-3">
      <p className="text-sm">{message}</p>
      <div className="flex gap-2 justify-end">
        <Button
          size="sm"
          variant="outline"
          type="button"
          disabled={isPending}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          variant="outline"
          type="button"
          disabled={isPending}
          className={
            isDestructive
              ? "border-rose-300 bg-rose-50 text-rose-950 hover:bg-rose-100 hover:text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100"
              : ""
          }
          onClick={onConfirm}
        >
          {isPending ? "Working…" : "Confirm"}
        </Button>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { UserRound } from "lucide-react";

import { Button } from "../../components/ui/button";
import { tripcastApi } from "../../convex/tripcastApi";
import type {
  AttributionRole,
  AttributionSourceType,
  Role,
} from "../../convex/tripcastApi";
import { useDebugLogger } from "../../debug/useDebugLogger";

const ROLE_OPTIONS: { value: AttributionRole; label: string }[] = [
  { value: "traveler_added", label: "Added by Traveler" },
  { value: "contributor", label: "Contributor" },
  { value: "credited", label: "Credited" },
  { value: "creator", label: "Creator" },
  { value: "proposer", label: "Proposer" },
];

type DraftAttribution = {
  userId: string;
  role: AttributionRole;
};

type AttributionBlockProps = {
  token: string;
  viewerRole: Role;
  sourceType: AttributionSourceType;
  sourceId: string;
};

function roleLabel(role: AttributionRole) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

export default function AttributionBlock({
  token,
  viewerRole,
  sourceType,
  sourceId,
}: AttributionBlockProps) {
  const log = useDebugLogger("AttributionBlock", "src/features/attributions/AttributionBlock.tsx");
  const data = useQuery(tripcastApi.attributions.listAttributionsForSource, {
    token,
    sourceType,
    sourceId,
  });
  const followers = useQuery(
    tripcastApi.followerAdmin.listFollowers,
    viewerRole === "traveler" ? { token } : "skip",
  );
  const setAttributions = useMutation(tripcastApi.attributions.travelerSetFollowerAttributions);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<DraftAttribution[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState<AttributionRole>("traveler_added");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const followerAttributions = useMemo(
    () =>
      (data?.attributions ?? [])
        .filter((item) => item.userId !== null && !item.isDev)
        .map((item) => ({ userId: item.userId!, role: item.role })),
    [data?.attributions],
  );

  useEffect(() => {
    if (!isEditing) setDraft(followerAttributions);
  }, [followerAttributions, isEditing]);

  const isTraveler = viewerRole === "traveler";
  const availableFollowers = (followers ?? []).filter(
    (follower) => !draft.some((item) => item.userId === follower.userId),
  );
  const canSave = isTraveler && !isSaving;

  if (!data && !isTraveler) return null;
  if (!isTraveler && !data?.publicCopy) return null;

  function addDraftAttribution() {
    if (!selectedUserId) return;
    setDraft((current) => [
      ...current,
      { userId: selectedUserId, role: selectedRole },
    ]);
    setSelectedUserId("");
    setSelectedRole("traveler_added");
  }

  function removeDraftAttribution(userId: string) {
    setDraft((current) => current.filter((item) => item.userId !== userId));
  }

  async function saveDraft() {
    setIsSaving(true);
    setError(null);
    log.logMutation("attribution:set", { sourceType });
    try {
      await setAttributions({
        token,
        sourceType,
        sourceId,
        attributions: draft,
      });
      log.logMutation("attribution:set:success", { count: draft.length });
      setIsEditing(false);
    } catch (e) {
      log.error("attribution:set:error", "mutation", { message: String(e) });
      setError(e instanceof Error ? e.message : "Unable to save attribution.");
    } finally {
      setIsSaving(false);
    }
  }

  function displayNameFor(userId: string) {
    return followers?.find((follower) => follower.userId === userId)?.displayName ?? "Follower";
  }

  return (
    <section className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <UserRound className="h-3 w-3" aria-hidden />
            Attribution
          </p>
          {data?.publicCopy ? (
            <p className="mt-1 text-sm text-[var(--ink-1)]">{data.publicCopy}</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {isTraveler ? "No public attribution yet." : ""}
            </p>
          )}
        </div>
        {isTraveler ? (
          <button
            type="button"
            className="text-xs text-navy underline"
            onClick={() => {
              log.logUi(isEditing ? "attribution:edit:cancel" : "attribution:edit:open", { sourceType });
              setIsEditing((current) => !current);
              setError(null);
            }}
          >
            {isEditing ? "Cancel" : "Edit credits"}
          </button>
        ) : null}
      </div>

      {isTraveler && !isEditing ? (
        <div className="grid gap-1 text-xs text-muted-foreground">
          {(data?.attributions ?? []).map((item) => (
            <span key={item._id}>
              {item.displayName ?? "Hidden"} · {roleLabel(item.role)}
              {item.showAttribution === false ? " · hidden publicly" : ""}
            </span>
          ))}
        </div>
      ) : null}

      {isTraveler && isEditing ? (
        <div className="grid gap-2">
          <div className="grid gap-1">
            {draft.length === 0 ? (
              <p className="text-xs text-muted-foreground">No Followers credited.</p>
            ) : (
              draft.map((item) => (
                <div
                  key={item.userId}
                  className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {displayNameFor(item.userId)} · {roleLabel(item.role)}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-rose-600 underline"
                    onClick={() => removeDraftAttribution(item.userId)}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Add Follower</option>
              {availableFollowers.map((follower) => (
                <option key={follower.userId} value={follower.userId}>
                  {follower.displayName}
                  {follower.showAttribution === false ? " (hidden publicly)" : ""}
                </option>
              ))}
            </select>
            <select
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value as AttributionRole)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!selectedUserId}
              onClick={addDraftAttribution}
            >
              Add
            </Button>
          </div>

          {error ? <p className="text-xs text-rose-600" role="alert">{error}</p> : null}
          <Button type="button" size="sm" disabled={!canSave} onClick={saveDraft}>
            {isSaving ? "Saving..." : "Save credits"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

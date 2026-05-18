import { useState } from "react";
import { useMutation } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { Challenge, Role, TransactionInlineInput } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import TravelFundsInlineSection, {
  type TravelFundsInlineState,
} from "../travelfunds/TravelFundsInlineSection";

const RESPONSE_PRESETS = [
  "Looks good",
  "Maybe later",
  "Too far right now",
  "Too expensive right now",
  "Not enough time",
  "Already did something similar",
  "Saving this for later",
  "Not today",
];

type Props = {
  challenge: Challenge | null;
  token: string;
  role: Role;
  isOwn?: boolean;
  onClose: () => void;
  onStartChallenge?: () => void;
  onRequestCoordinatePick?: (callback: (coord: { lat: number; lon: number }) => void) => void;
  onViewOnMap?: () => void;
  /** Mission Complete-as-Story branch — when provided and the mission is
   *  in-progress, a "Complete as story" button appears alongside the existing
   *  "Complete Challenge" action. The parent (TripMap) owns the story-prefill
   *  state, opens AddCheckpointSheet, and calls travelerCompleteChallenge
   *  after the resulting check-in lands. */
  onCompleteAsStory?: (challenge: Challenge, transaction?: TransactionInlineInput) => void;
};

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    proposed: "Pending review",
    visible: "Accepted",
    planned: "Accepted",
    in_progress: "In progress",
    completed: "Completed",
    dropped: "Dropped",
  };
  return labels[status] ?? status;
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg || "Something went wrong.";
}

export default function ChallengeDetailSheet({
  challenge,
  token,
  role,
  isOwn,
  onClose,
  onStartChallenge,
  onRequestCoordinatePick,
  onViewOnMap,
  onCompleteAsStory,
}: Props) {
  // Drop/reject form state
  const [responseNote, setResponseNote] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editLat, setEditLat] = useState<number | undefined>(undefined);
  const [editLon, setEditLon] = useState<number | undefined>(undefined);
  const [editCost, setEditCost] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editEnergy, setEditEnergy] = useState<"" | "low" | "medium" | "high">("");

  const [actionError, setActionError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [completionTxState, setCompletionTxState] = useState<TravelFundsInlineState>(null);

  const accept = useMutation(tripcastApi.challenges.travelerAcceptChallenge);
  const drop = useMutation(tripcastApi.challenges.travelerDropChallenge);
  const deleteSilently = useMutation(tripcastApi.challenges.travelerDeleteChallenge);
  const edit = useMutation(tripcastApi.challenges.travelerEditChallenge);
  const start = useMutation(tripcastApi.challenges.travelerStartChallenge);
  const complete = useMutation(tripcastApi.challenges.travelerCompleteChallenge);
  const togglePin = useMutation(tripcastApi.challenges.travelerToggleChallengeMapPin);
  const withdraw = useMutation(tripcastApi.challenges.followerWithdrawChallenge);

  if (!challenge) return null;

  const isTraveler = role === "traveler";
  const canAct = !isWorking;
  const status = challenge.status;
  const hasLocation = challenge.lat !== undefined && challenge.lon !== undefined;

  function openEditMode() {
    setEditTitle(challenge!.title);
    setEditDesc(challenge!.description ?? "");
    setEditLocation(challenge!.locationLabel ?? "");
    setEditLat(challenge!.lat);
    setEditLon(challenge!.lon);
    setEditCost(challenge!.estimatedCostUsd !== undefined ? String(challenge!.estimatedCostUsd) : "");
    setEditDuration(
      challenge!.estimatedDurationMinutes !== undefined
        ? String(challenge!.estimatedDurationMinutes)
        : "",
    );
    setEditEnergy((challenge!.estimatedEnergyImpact as "" | "low" | "medium" | "high") ?? "");
    setIsEditing(true);
    setActionError(null);
  }

  function cancelEditMode() {
    setIsEditing(false);
    setActionError(null);
  }

  async function handleSaveEdit() {
    if (!challenge || !editTitle.trim()) {
      setActionError("Title is required.");
      return;
    }
    setIsWorking(true);
    setActionError(null);
    try {
      await edit({
        token,
        challengeId: challenge._id,
        title: editTitle,
        description: editDesc.trim() || undefined,
        locationLabel: editLocation.trim() || undefined,
        lat: editLat,
        lon: editLon,
        estimatedCostUsd: editCost ? parseFloat(editCost) : undefined,
        estimatedDurationMinutes: editDuration ? parseInt(editDuration, 10) : undefined,
        estimatedEnergyImpact: editEnergy || undefined,
      });
      setIsEditing(false);
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  function handlePickEditCoordinates() {
    onRequestCoordinatePick?.((coord) => {
      setEditLat(coord.lat);
      setEditLon(coord.lon);
    });
  }

  async function handleAccept() {
    if (!challenge) return;
    setIsWorking(true);
    setActionError(null);
    try {
      await accept({
        token,
        challengeId: challenge._id,
        responseNote: responseNote || undefined,
        responsePreset: selectedPreset || undefined,
      });
      onClose();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleReject() {
    if (!challenge) return;
    setIsWorking(true);
    setActionError(null);
    try {
      await drop({
        token,
        challengeId: challenge._id,
        responseNote: responseNote || undefined,
        responsePreset: selectedPreset || undefined,
      });
      onClose();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDeleteSilently() {
    if (!challenge) return;
    setIsWorking(true);
    setActionError(null);
    try {
      await deleteSilently({ token, challengeId: challenge._id });
      onClose();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleStart() {
    if (!challenge) return;
    setIsWorking(true);
    setActionError(null);
    try {
      await start({ token, challengeId: challenge._id });
      onStartChallenge?.();
      onClose();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleComplete() {
    if (!challenge) return;
    // Block save when the inline Travel Funds section is open with
    // partial/invalid data — surface the error rather than silently dropping
    // the transaction.
    if (completionTxState && "error" in completionTxState) {
      setActionError(completionTxState.error);
      return;
    }
    const inlineTransaction =
      completionTxState && "value" in completionTxState
        ? completionTxState.value
        : undefined;
    setIsWorking(true);
    setActionError(null);
    try {
      await complete({
        token,
        challengeId: challenge._id,
        transaction: inlineTransaction,
      });
      onClose();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  function handleCompleteAsStory() {
    if (!challenge || !onCompleteAsStory) return;
    if (completionTxState && "error" in completionTxState) {
      setActionError(completionTxState.error);
      return;
    }
    const transaction =
      completionTxState && "value" in completionTxState ? completionTxState.value : undefined;
    onCompleteAsStory(challenge, transaction);
  }

  async function handleTogglePin() {
    if (!challenge) return;
    setIsWorking(true);
    setActionError(null);
    try {
      await togglePin({ token, challengeId: challenge._id, hidden: !challenge.mapHidden });
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleWithdraw() {
    if (!challenge) return;
    setIsWorking(true);
    setActionError(null);
    try {
      await withdraw({ token, challengeId: challenge._id });
      onClose();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Edit mode
  // ---------------------------------------------------------------------------

  if (isEditing) {
    return (
      <div className="flex flex-col gap-4 p-4 pt-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-navy">Edit Challenge</span>
          <button
            type="button"
            className="text-xs text-muted-foreground underline"
            onClick={cancelEditMode}
          >
            Cancel
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          The follower will see the edits to the challenge.
        </p>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <Input
            placeholder="Challenge title"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            maxLength={200}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
          <Textarea
            placeholder="Any details…"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={2}
            maxLength={500}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Location label (optional)</label>
          <Input
            placeholder="Place name"
            value={editLocation}
            onChange={(e) => setEditLocation(e.target.value)}
            maxLength={200}
          />
          <div className="flex items-center gap-2 mt-1">
            {onRequestCoordinatePick && (
              <button
                type="button"
                className="text-xs text-navy underline"
                onClick={handlePickEditCoordinates}
              >
                ↗ Pick on map
              </button>
            )}
            {editLat !== undefined && editLon !== undefined && (
              <span className="text-xs text-muted-foreground">
                📍 {editLat.toFixed(5)}, {editLon.toFixed(5)}
                <button
                  type="button"
                  className="ml-1 text-rose-500 underline"
                  onClick={() => { setEditLat(undefined); setEditLon(undefined); }}
                >
                  clear
                </button>
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs font-medium text-muted-foreground">Est. cost (USD, optional)</label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={editCost}
              onChange={(e) => setEditCost(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs font-medium text-muted-foreground">Est. duration (min, optional)</label>
            <Input
              type="number"
              min="1"
              step="1"
              placeholder="60"
              value={editDuration}
              onChange={(e) => setEditDuration(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Energy impact (optional)</label>
          <div className="flex gap-2">
            {(["low", "medium", "high"] as const).map((level) => (
              <button
                key={level}
                type="button"
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  editEnergy === level
                    ? "bg-navy text-white border-navy"
                    : "bg-white text-navy border-slate-300 hover:bg-slate-50"
                }`}
                onClick={() => setEditEnergy(editEnergy === level ? "" : level)}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {actionError && (
          <p className="text-sm text-rose-600" role="alert">{actionError}</p>
        )}

        <Button
          size="sm"
          type="button"
          disabled={isWorking || !editTitle.trim()}
          onClick={handleSaveEdit}
        >
          {isWorking ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Normal detail view
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4 p-4 pt-0">
      {/* Status badge + Edit button */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {statusLabel(status)}
        </span>
        {isTraveler && (
          <button
            type="button"
            className="text-xs text-navy underline"
            onClick={openEditMode}
          >
            Edit
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold text-navy">{challenge.title}</h2>
        {challenge.description && (
          <p className="text-sm text-muted-foreground">{challenge.description}</p>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        {challenge.locationLabel && <span>📍 {challenge.locationLabel}</span>}
        {!hasLocation && <span className="text-xs italic">No map location (text-only challenge)</span>}
        {challenge.estimatedDurationMinutes && (
          <span>⏱ Est. {challenge.estimatedDurationMinutes} min</span>
        )}
        {challenge.estimatedCostUsd !== undefined && (
          <span>💰 Est. ${challenge.estimatedCostUsd.toFixed(2)} USD</span>
        )}
        {challenge.estimatedEnergyImpact && (
          <span>⚡ Energy: {challenge.estimatedEnergyImpact}</span>
        )}
      </div>

      {/* View on map */}
      {hasLocation && onViewOnMap && (
        <button
          type="button"
          onClick={onViewOnMap}
          className="self-start text-xs text-navy underline"
        >
          View on map
        </button>
      )}

      {/* Traveler response (preset + note) — visible to both traveler and follower */}
      {(challenge.travelerResponsePreset || challenge.travelerResponseNote) && !challenge.silentDrop && (
        <div className="rounded-md bg-slate-50 border border-slate-200 p-3 flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Traveler's response</p>
          {challenge.travelerResponsePreset && (
            <span className="self-start px-2.5 py-0.5 text-xs rounded-full bg-navy/10 text-navy font-medium">
              {challenge.travelerResponsePreset}
            </span>
          )}
          {challenge.travelerResponseNote && (
            <p className="text-sm text-foreground">{challenge.travelerResponseNote}</p>
          )}
        </div>
      )}

      {/* Reject with response form */}
      {isTraveler && showRejectForm && (
        <div className="flex flex-col gap-3 border border-slate-200 rounded-lg p-3">
          <div className="flex flex-wrap gap-2">
            {RESPONSE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  selectedPreset === preset
                    ? "bg-navy text-white border-navy"
                    : "bg-white text-navy border-slate-300 hover:bg-slate-50"
                }`}
                onClick={() => setSelectedPreset(selectedPreset === preset ? "" : preset)}
              >
                {preset}
              </button>
            ))}
          </div>
          <Textarea
            placeholder="Custom response note (optional)…"
            value={responseNote}
            onChange={(e) => setResponseNote(e.target.value)}
            rows={2}
            maxLength={500}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                setShowRejectForm(false);
                setResponseNote("");
                setSelectedPreset("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              type="button"
              disabled={!canAct}
              onClick={handleReject}
              className="bg-rose-600 hover:bg-rose-700 text-white border-rose-600"
            >
              {isWorking ? "Dropping…" : "Confirm drop"}
            </Button>
          </div>
        </div>
      )}

      {/* Delete silently confirmation */}
      {isTraveler && showDeleteConfirm && (
        <div className="flex flex-col gap-3 border border-rose-200 rounded-lg p-3 bg-rose-50">
          <p className="text-sm text-rose-800">
            This permanently deletes the challenge — the proposer will no longer see it. Are you sure?
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              type="button"
              disabled={!canAct}
              onClick={handleDeleteSilently}
              className="bg-rose-600 hover:bg-rose-700 text-white border-rose-600"
            >
              {isWorking ? "Deleting…" : "Yes, delete"}
            </Button>
          </div>
        </div>
      )}

      {actionError && (
        <p className="text-sm text-rose-600" role="alert">{actionError}</p>
      )}

      {/* Traveler actions (hidden while reject form or delete confirm is open) */}
      {isTraveler && !showRejectForm && !showDeleteConfirm && (
        <div className="flex flex-col gap-2">
          {status === "proposed" && (
            <>
              <Button size="sm" type="button" disabled={!canAct} onClick={handleAccept}>
                Accept and publish
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={() => setShowRejectForm(true)}
              >
                Drop with response
              </Button>
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1 h-px bg-rose-200" />
                <span className="text-[10px] text-rose-400 font-medium uppercase tracking-wide">⚠ Danger</span>
                <div className="flex-1 h-px bg-rose-200" />
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={() => setShowDeleteConfirm(true)}
                className="border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                Delete silently
              </Button>
            </>
          )}

          {(status === "visible" || status === "planned") && (
            <>
              <Button
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={handleStart}
                className="bg-amber-500 hover:bg-amber-600 text-white border-amber-500"
              >
                Start and set as Current Activity
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={handleTogglePin}
              >
                {challenge.mapHidden ? "Show on map" : "Hide from map"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={() => setShowRejectForm(true)}
              >
                Drop with note
              </Button>
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1 h-px bg-rose-200" />
                <span className="text-[10px] text-rose-400 font-medium uppercase tracking-wide">⚠ Danger</span>
                <div className="flex-1 h-px bg-rose-200" />
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={() => setShowDeleteConfirm(true)}
                className="border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                Delete silently
              </Button>
            </>
          )}

          {status === "in_progress" && (
            <>
              <p className="text-xs text-muted-foreground">
                Completing this challenge will mark the linked Current Activity as done and open the Check-in form.
              </p>
              {isTraveler && (
                <TravelFundsInlineSection
                  token={token}
                  prefill={{
                    title: challenge.title,
                    ...(challenge.estimatedCostUsd !== undefined
                      ? {
                          localAmount: challenge.estimatedCostUsd,
                          currencyCode: "USD",
                          localCurrencyPerUsd: 1,
                        }
                      : {}),
                  }}
                  onChange={setCompletionTxState}
                />
              )}
              {onCompleteAsStory && (
                <Button
                  size="sm"
                  type="button"
                  disabled={!canAct}
                  onClick={handleCompleteAsStory}
                  className="border-[var(--plum)] text-white"
                  style={{ background: "var(--plum)" }}
                >
                  Complete as story
                </Button>
              )}
              <Button
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={handleComplete}
                className="bg-green-600 hover:bg-green-700 text-white border-green-600"
              >
                {onCompleteAsStory ? "Mark complete (no story)" : "Complete Challenge"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={() => setShowRejectForm(true)}
              >
                Drop with note
              </Button>
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1 h-px bg-rose-200" />
                <span className="text-[10px] text-rose-400 font-medium uppercase tracking-wide">⚠ Danger</span>
                <div className="flex-1 h-px bg-rose-200" />
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={() => setShowDeleteConfirm(true)}
                className="border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                Delete silently
              </Button>
            </>
          )}
        </div>
      )}

      {/* Traveler: add a story to a completed mission (no status change) */}
      {isTraveler && status === "completed" && onCompleteAsStory && (
        <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-3">
          <p className="text-xs text-muted-foreground">
            Got a story to add for how this mission went? It'll land in the journal linked to this entry.
          </p>
          <Button
            size="sm"
            type="button"
            disabled={!canAct}
            onClick={handleCompleteAsStory}
            className="border-[var(--plum)] text-white w-fit"
            style={{ background: "var(--plum)" }}
          >
            Add a story
          </Button>
        </div>
      )}

      {/* Support crew: withdraw own proposed challenge */}
      {!isTraveler && isOwn && status === "proposed" && (
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={!canAct}
          onClick={handleWithdraw}
          className="border-rose-300 text-rose-700 hover:bg-rose-50 w-fit"
        >
          Withdraw proposal
        </Button>
      )}
    </div>
  );
}

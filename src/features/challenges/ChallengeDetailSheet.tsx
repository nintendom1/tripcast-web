import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { Challenge, Role } from "../../convex/tripcastApi";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";

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

export default function ChallengeDetailSheet({ challenge, token, role, isOwn, onClose, onStartChallenge }: Props) {
  const [responseNote, setResponseNote] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [showDropForm, setShowDropForm] = useState(false);
  const [silentDrop, setSilentDrop] = useState(false);

  const accept = useMutation(tripcastApi.challenges.travelerAcceptChallenge);
  const drop = useMutation(tripcastApi.challenges.travelerDropChallenge);
  const start = useMutation(tripcastApi.challenges.travelerStartChallenge);
  const complete = useMutation(tripcastApi.challenges.travelerCompleteChallenge);
  const togglePin = useMutation(tripcastApi.challenges.travelerToggleChallengeMapPin);
  const withdraw = useMutation(tripcastApi.challenges.followerWithdrawChallenge);

  if (!challenge) return null;

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

  async function handleDrop() {
    if (!challenge) return;
    setIsWorking(true);
    setActionError(null);
    try {
      await drop({
        token,
        challengeId: challenge._id,
        responseNote: responseNote || undefined,
        responsePreset: selectedPreset || undefined,
        silent: silentDrop,
      });
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
    setIsWorking(true);
    setActionError(null);
    try {
      await complete({ token, challengeId: challenge._id });
      onClose();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
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

  const isTraveler = role === "traveler";
  const canAct = !isWorking;
  const status = challenge.status;
  const hasLocation = challenge.lat !== undefined && challenge.lon !== undefined;

  return (
    <div className="flex flex-col gap-4 p-4 pt-0">
      {/* Status badge */}
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {statusLabel(status)}
        </span>
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

      {/* Traveler response note (shown if present and not silent) */}
      {challenge.travelerResponseNote && !challenge.silentDrop && (
        <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Traveler's note</p>
          <p className="text-sm text-foreground">{challenge.travelerResponseNote}</p>
        </div>
      )}

      {/* Drop form for traveler */}
      {isTraveler && showDropForm && (
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
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={silentDrop}
              onChange={(e) => setSilentDrop(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-muted-foreground">Silent reject (proposer won't see a rejection notice)</span>
          </label>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => { setShowDropForm(false); setResponseNote(""); setSelectedPreset(""); }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              type="button"
              disabled={!canAct}
              onClick={handleDrop}
              className="bg-rose-600 hover:bg-rose-700 text-white border-rose-600"
            >
              {isWorking ? "Dropping…" : "Confirm drop"}
            </Button>
          </div>
        </div>
      )}

      {actionError && (
        <p className="text-sm text-rose-600" role="alert">{actionError}</p>
      )}

      {/* Actions for traveler */}
      {isTraveler && (
        <div className="flex flex-col gap-2">
          {status === "proposed" && (
            <>
              <Button size="sm" type="button" disabled={!canAct} onClick={handleAccept}>
                Accept and publish
              </Button>
              {!showDropForm && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={!canAct}
                  onClick={() => setShowDropForm(true)}
                >
                  Reject / drop
                </Button>
              )}
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
              {!showDropForm && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={!canAct}
                  onClick={() => setShowDropForm(true)}
                >
                  Drop
                </Button>
              )}
            </>
          )}

          {status === "in_progress" && (
            <>
              <p className="text-xs text-muted-foreground">
                Completing this challenge will mark the linked Current Activity as done and open the Check-in form.
              </p>
              <Button
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={handleComplete}
                className="bg-green-600 hover:bg-green-700 text-white border-green-600"
              >
                Complete Challenge
              </Button>
              {!showDropForm && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={!canAct}
                  onClick={() => setShowDropForm(true)}
                >
                  Drop
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {/* Support crew actions: withdraw own proposed challenge */}
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

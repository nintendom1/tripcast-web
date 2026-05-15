import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";

type Props = {
  token: string;
  onSuccess: (autoPublished: boolean) => void;
  onRequestCoordinatePick?: (callback: (coord: { lat: number; lon: number }) => void) => void;
};

function friendlyError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("Too many Challenges")) return "Too many Challenges submitted too quickly. Try again soon.";
  if (msg.includes("Trip challenge limit")) return "Trip challenge limit reached for today.";
  return msg || "Unable to submit challenge.";
}

export default function ChallengeProposalForm({ token, onSuccess, onRequestCoordinatePick }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lon, setLon] = useState<number | undefined>(undefined);
  const [costStr, setCostStr] = useState("");
  const [durationStr, setDurationStr] = useState("");
  const [energyImpact, setEnergyImpact] = useState<"low" | "medium" | "high" | "">("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNoLocationConfirm, setShowNoLocationConfirm] = useState(false);

  const settings = useQuery(tripcastApi.challengeSettings.supportCrewGetChallengeSettings, { token });
  const propose = useMutation(tripcastApi.challenges.followerProposeChallenge);

  function reset() {
    setTitle("");
    setDescription("");
    setLocationLabel("");
    setLat(undefined);
    setLon(undefined);
    setCostStr("");
    setDurationStr("");
    setEnergyImpact("");
    setError(null);
    setShowNoLocationConfirm(false);
  }

  async function submit() {
    setIsSaving(true);
    setError(null);
    try {
      const result = await propose({
        token,
        title: title.trim(),
        description: description.trim() || undefined,
        locationLabel: locationLabel.trim() || undefined,
        lat,
        lon,
        estimatedCostUsd: costStr ? parseFloat(costStr) : undefined,
        estimatedDurationMinutes: durationStr ? parseInt(durationStr, 10) : undefined,
        estimatedEnergyImpact: energyImpact || undefined,
      });
      reset();
      onSuccess(result.autoPublished);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setIsSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!locationLabel.trim() && lat === undefined) {
      setShowNoLocationConfirm(true);
      return;
    }
    void submit();
  }

  function handlePickOnMap() {
    onRequestCoordinatePick?.((coord) => {
      setLat(coord.lat);
      setLon(coord.lon);
    });
  }

  if (showNoLocationConfirm) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <p className="text-sm text-foreground">
          There's no location. It will not appear on the map. Are you sure you want to continue?
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowNoLocationConfirm(false)}
          >
            Go back
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isSaving}
            onClick={() => { setShowNoLocationConfirm(false); void submit(); }}
          >
            {isSaving ? "Submitting…" : "Submit without location"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="challenge-title">
          Challenge title <span aria-hidden>*</span>
        </label>
        <Input
          id="challenge-title"
          placeholder="e.g. Try the local street food"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="challenge-desc">
          Notes (optional)
        </label>
        <Textarea
          id="challenge-desc"
          placeholder="Any details about this challenge…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={500}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="challenge-location">
          Location (optional)
        </label>
        <Input
          id="challenge-location"
          placeholder="e.g. Night Market, Chiang Mai"
          value={locationLabel}
          onChange={(e) => setLocationLabel(e.target.value)}
          maxLength={200}
        />
        <div className="flex items-center gap-2 mt-1">
          {onRequestCoordinatePick && (
            <button
              type="button"
              className="text-xs text-navy underline"
              onClick={handlePickOnMap}
            >
              ↗ Pick on map
            </button>
          )}
          {lat !== undefined && lon !== undefined && (
            <span className="text-xs text-muted-foreground">
              📍 {lat.toFixed(5)}, {lon.toFixed(5)}
              <button
                type="button"
                className="ml-1 text-rose-500 underline"
                onClick={() => { setLat(undefined); setLon(undefined); }}
              >
                clear
              </button>
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="challenge-cost">
            Est. cost (USD, optional)
          </label>
          <Input
            id="challenge-cost"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={costStr}
            onChange={(e) => setCostStr(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="challenge-duration">
            Est. duration (min, optional)
          </label>
          <Input
            id="challenge-duration"
            type="number"
            min="1"
            step="1"
            placeholder="60"
            value={durationStr}
            onChange={(e) => setDurationStr(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          Energy impact (optional)
        </label>
        <div className="flex gap-2">
          {(["low", "medium", "high"] as const).map((level) => (
            <button
              key={level}
              type="button"
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                energyImpact === level
                  ? "bg-navy text-white border-navy"
                  : "bg-white text-navy border-slate-300 hover:bg-slate-50"
              }`}
              onClick={() => setEnergyImpact(energyImpact === level ? "" : level)}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      )}

      {settings?.moderationMode === "manual_review" && (
        <p className="text-xs text-muted-foreground">
          Your challenge will be sent to the Traveler for review before it appears to others.
        </p>
      )}

      <Button type="submit" size="sm" disabled={isSaving || !title.trim()}>
        {isSaving ? "Submitting…" : "Propose Challenge"}
      </Button>
    </form>
  );
}

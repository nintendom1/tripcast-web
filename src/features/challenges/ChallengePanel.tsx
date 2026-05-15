import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";

import { tripcastApi } from "../../convex/tripcastApi";
import type { Challenge, ChallengeStatus, Role } from "../../convex/tripcastApi";
import ChallengeCard from "./ChallengeCard";
import ChallengeProposalForm from "./ChallengeProposalForm";
import ChallengeDetailSheet from "./ChallengeDetailSheet";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { Button } from "../../components/ui/button";

type Props = {
  open: boolean;
  token: string;
  role: Role;
  sessionId?: string;
  userId?: string;
  onClose: () => void;
  onStartChallenge?: () => void;
  onRequestCoordinatePick?: (callback: (coord: { lat: number; lon: number }) => void) => void;
  isPickingCoordinate?: boolean;
};

type TravelerFilter = "all" | "proposed" | "visible" | "in_progress" | "completed" | "dropped";

const TRAVELER_FILTERS: { value: TravelerFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "proposed", label: "Proposed" },
  { value: "visible", label: "Visible" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

// ---------------------------------------------------------------------------
// Traveler view
// ---------------------------------------------------------------------------

function TravelerChallengePanel({
  token,
  onClose,
  onStartChallenge,
  onRequestCoordinatePick,
  isPickingCoordinate,
}: {
  token: string;
  onClose: () => void;
  onStartChallenge?: () => void;
  onRequestCoordinatePick?: (callback: (coord: { lat: number; lon: number }) => void) => void;
  isPickingCoordinate?: boolean;
}) {
  const [filter, setFilter] = useState<TravelerFilter>("all");
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const allChallenges = useQuery(tripcastApi.challenges.travelerListChallenges, { token });

  const filtered = (allChallenges ?? []).filter((c) => {
    if (filter === "all") return true;
    if (filter === "visible") return c.status === "visible" || c.status === "planned";
    return c.status === filter;
  });

  function openDetail(challenge: Challenge) {
    setSelectedChallenge(challenge);
    setIsDetailOpen(true);
  }

  return (
    <>
      <div className="flex flex-col gap-3 overflow-y-auto h-full">
        <div className="flex gap-2 items-center justify-between px-4 pt-2">
          <h2 className="text-sm font-semibold text-navy">Challenges</h2>
          <Button
            size="sm"
            variant={isCreating ? "outline" : "default"}
            type="button"
            onClick={() => setIsCreating((p) => !p)}
          >
            {isCreating ? "Cancel" : "+ New Challenge"}
          </Button>
        </div>

        {isCreating && (
          <div className="px-4 pb-2 border-b border-slate-100">
            <TravelerCreateForm
              token={token}
              onSuccess={() => setIsCreating(false)}
              onRequestCoordinatePick={onRequestCoordinatePick}
            />
          </div>
        )}

        {/* Filters */}
        <div className="px-4 flex gap-2 overflow-x-auto pb-1">
          {TRAVELER_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`px-3 py-1 text-xs rounded-full border whitespace-nowrap transition-colors ${
                filter === f.value
                  ? "bg-navy text-white border-navy"
                  : "bg-white text-navy border-slate-300 hover:bg-slate-50"
              }`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex flex-col gap-2 px-4 pb-4">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {filter === "all" ? "No challenges yet." : `No ${filter} challenges.`}
            </p>
          )}
          {filtered.map((c) => (
            <ChallengeCard key={c._id} challenge={c} onClick={() => openDetail(c)} />
          ))}
        </div>
      </div>

      <Sheet open={isDetailOpen} onOpenChange={(o) => { if (!o) { setIsDetailOpen(false); setSelectedChallenge(null); } }}>
        <SheetContent
          side="bottom"
          showBackdrop={!isPickingCoordinate}
          className={isPickingCoordinate ? "invisible pointer-events-none" : undefined}
        >
          <SheetHeader>
            <SheetTitle className="sr-only">Challenge details</SheetTitle>
          </SheetHeader>
          <ChallengeDetailSheet
            challenge={selectedChallenge}
            token={token}
            role="traveler"
            onClose={() => { setIsDetailOpen(false); setSelectedChallenge(null); }}
            onStartChallenge={onStartChallenge}
            onRequestCoordinatePick={onRequestCoordinatePick}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// Traveler create form
// ---------------------------------------------------------------------------

function TravelerCreateForm({
  token,
  onSuccess,
  onRequestCoordinatePick,
}: {
  token: string;
  onSuccess: () => void;
  onRequestCoordinatePick?: (callback: (coord: { lat: number; lon: number }) => void) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lon, setLon] = useState<number | undefined>(undefined);
  const [costStr, setCostStr] = useState("");
  const [durationStr, setDurationStr] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation(tripcastApi.challenges.travelerCreateChallenge);

  function handlePickOnMap() {
    onRequestCoordinatePick?.((coord) => {
      setLat(coord.lat);
      setLon(coord.lon);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    setIsSaving(true);
    setError(null);
    try {
      await create({
        token,
        title: title.trim(),
        description: description.trim() || undefined,
        locationLabel: locationLabel.trim() || undefined,
        lat,
        lon,
        estimatedCostUsd: costStr ? parseFloat(costStr) : undefined,
        estimatedDurationMinutes: durationStr ? parseInt(durationStr, 10) : undefined,
      });
      onSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Unable to create challenge.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Title</label>
        <input
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy"
          placeholder="Challenge title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Location (optional)</label>
        <input
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy"
          placeholder="Place name"
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
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
        <textarea
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy resize-none"
          placeholder="Any details…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={500}
        />
      </div>
      {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
      <Button size="sm" type="submit" disabled={isSaving || !title.trim()}>
        {isSaving ? "Creating…" : "Create Challenge"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Support crew view
// ---------------------------------------------------------------------------

type CrewTab = "mine" | "active";

function SupportCrewChallengePanel({
  token,
  userId,
  onRequestCoordinatePick,
}: {
  token: string;
  userId?: string;
  onRequestCoordinatePick?: (callback: (coord: { lat: number; lon: number }) => void) => void;
}) {
  const [tab, setTab] = useState<CrewTab>("active");
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isProposeOpen, setIsProposeOpen] = useState(false);

  const myChallenges = useQuery(tripcastApi.challenges.followerListMyChallenges, { token });

  function openDetail(challenge: Challenge) {
    setSelectedChallenge(challenge);
    setIsDetailOpen(true);
  }

  const mine = myChallenges?.mine ?? [];
  const publicChallenges = myChallenges?.public ?? [];
  const mineIds = new Set(mine.map((c) => c._id));

  return (
    <>
      <div className="flex flex-col gap-3 overflow-y-auto h-full">
        {/* Header with Propose button */}
        <div className="px-4 pt-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-navy">Challenges</h2>
          <Button
            size="sm"
            variant={isProposeOpen ? "outline" : "default"}
            type="button"
            onClick={() => { setIsProposeOpen((p) => !p); setSuccessMsg(null); }}
          >
            {isProposeOpen ? "Cancel" : "+ Propose"}
          </Button>
        </div>

        {/* Inline proposal form */}
        {isProposeOpen && (
          <div className="px-4 pb-2 border-b border-slate-100">
            <ChallengeProposalForm
              token={token}
              onRequestCoordinatePick={onRequestCoordinatePick}
              onSuccess={(autoPublished) => {
                setSuccessMsg(
                  autoPublished
                    ? "Challenge posted!"
                    : "Challenge sent to Traveler for review.",
                );
                setIsProposeOpen(false);
                setTab("mine");
              }}
            />
          </div>
        )}

        {successMsg && (
          <p className="px-4 text-sm text-green-700 bg-green-50 py-2 rounded-md mx-4" role="status">
            {successMsg}
          </p>
        )}

        {/* Tabs: Mine | Active */}
        <div className="flex gap-1 px-4 border-b border-slate-100 pb-2">
          {([
            { value: "mine" as CrewTab, label: `Mine (${mine.length})` },
            { value: "active" as CrewTab, label: "Active" },
          ] as const).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                tab === value
                  ? "bg-navy text-white border-navy"
                  : "bg-white text-navy border-slate-300 hover:bg-slate-50"
              }`}
              onClick={() => { setTab(value); setSuccessMsg(null); }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Mine tab */}
        {tab === "mine" && (
          <div className="flex flex-col gap-2 px-4 pb-4">
            {mine.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                You haven't proposed any challenges yet.
              </p>
            )}
            {mine.map((c) => (
              <ChallengeCard
                key={c._id}
                challenge={c}
                isOwn
                onClick={() => openDetail(c)}
              />
            ))}
          </div>
        )}

        {/* Active/public tab */}
        {tab === "active" && (
          <div className="flex flex-col gap-2 px-4 pb-4">
            {publicChallenges.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No active challenges right now.
              </p>
            )}
            {publicChallenges.map((c) => (
              <ChallengeCard
                key={c._id}
                challenge={c}
                isOwn={mineIds.has(c._id)}
                onClick={() => openDetail(c)}
              />
            ))}
          </div>
        )}
      </div>

      <Sheet
        open={isDetailOpen}
        onOpenChange={(o) => { if (!o) { setIsDetailOpen(false); setSelectedChallenge(null); } }}
      >
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle className="sr-only">Challenge details</SheetTitle>
          </SheetHeader>
          <ChallengeDetailSheet
            challenge={selectedChallenge}
            token={token}
            role="support_crew"
            isOwn={selectedChallenge ? mineIds.has(selectedChallenge._id) : false}
            onClose={() => { setIsDetailOpen(false); setSelectedChallenge(null); }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export default function ChallengePanel({
  open,
  token,
  role,
  sessionId,
  userId,
  onClose,
  onStartChallenge,
  onRequestCoordinatePick,
  isPickingCoordinate,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: -320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -320, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className="absolute top-0 left-0 bottom-0 z-[10] w-80 bg-white shadow-xl flex flex-col overflow-hidden"
          aria-label="Challenges panel"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
            <span className="font-semibold text-navy text-sm">Challenges</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded hover:bg-slate-50"
              onClick={onClose}
              aria-label="Close challenges panel"
            >
              Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {role === "traveler" ? (
              <TravelerChallengePanel
                token={token}
                onClose={onClose}
                onStartChallenge={onStartChallenge}
                onRequestCoordinatePick={onRequestCoordinatePick}
                isPickingCoordinate={isPickingCoordinate}
              />
            ) : (
              <SupportCrewChallengePanel
                token={token}
                userId={userId}
                onRequestCoordinatePick={onRequestCoordinatePick}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import "maplibre-gl/dist/maplibre-gl.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsDesktop } from "../../lib/useIsDesktop";
import { DesktopMapFrame } from "../layout/DesktopMapFrame";
import { useMutation, useQuery } from "convex/react";
import maplibregl, { Marker } from "maplibre-gl";
import { AnimatePresence, motion } from "framer-motion";
import { DollarSign } from "lucide-react";
import {
  tripcastApi,
  type AddCheckpointArgs,
  type BadgeType,
  type Checkpoint,
  type JournalEvent,
  type Role,
  type RouteVoteMapOverlay as RouteVoteMapOverlayType,
} from "../../convex/tripcastApi";
import AddCheckpointSheet, {
  type CheckpointPrefill,
  type SelectedCoordinate,
} from "./AddCheckpointSheet";
import RouteVoteMapOverlay from "./RouteVoteMapOverlay";
import MissionMarkers from "./MissionMarkers";
import MissionPanel from "../missions/MissionPanel";
import RouteVotePanel from "../routevote/RouteVotePanel";
import RouteVoteProgress from "../routevote/RouteVoteProgress";
import TravelerStateSheet from "../travelstate/TravelerStateSheet";
import TravelFundsSheet from "../travelfunds/TravelFundsSheet";
import {
  Dock,
  type DockTab,
  FanMenu,
  type FanAction,
  FundsCompactConnected,
  LivePill,
  MapCenterButton,
  MusicMuteIndicator,
  StatusCardConnected,
} from "../hud";
import TravelFundsInlineSection, {
  type TravelFundsInlineState,
} from "../travelfunds/TravelFundsInlineSection";
import {
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetTitle,
} from "../../components/ui/sheet";
import SetActivitySheet from "../currentactivity/SetActivitySheet";
import JournalSheet from "../journal/JournalSheet";
import StoryDetailSheet from "../journal/StoryDetailSheet";
import AchievementsConnected from "../achievements/AchievementsConnected";
import { useJournalUnread } from "../journal/useJournalUnread";
import { FeatureBoundary } from "../../components/resilience/FeatureBoundary";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useTripAudioScenario } from "../../lib/audio/useTripAudioScenario";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useTripPath } from "./useTripPath";
import { DebugChip } from "../../debug/DebugChip";
import { isEnabled, isCategoryEnabled, log as rawLog } from "../../debug/debugLogger";
import {
  MOOD_LABELS,
  MOOD_VALUES,
  ENERGY_LABELS,
  ENERGY_VALUES,
  STOMACH_LABELS,
  STOMACH_VALUES,
  STRESS_LABELS,
  STRESS_VALUES,
  SCHEDULE_LABELS,
  SCHEDULE_VALUES,
  ENERGY_SCORE_FOR_LEVEL,
  STRESS_SCORE_FOR_LEVEL,
  STOMACH_SCORE_FOR_LEVEL,
} from "../travelstate/travelerStateUtils";
import { isFiniteRouteCoordinate } from "../../lib/routeVoteUtils";
import { TERMS } from "../../copy/terminology";
import { MEADOW_SHEET_PERSONALITIES } from "../redesign/sheetPersonality";

const SEATTLE_CENTER: [number, number] = [-122.3321, 47.6062];
const OPEN_FREE_MAP_STYLE = "https://tiles.openfreemap.org/styles/bright";
const PANEL_ERROR_CLASS =
  "absolute bottom-5 left-5 z-[4] grid w-80 max-w-[calc(100%-40px)] gap-3 rounded-md border bg-background p-4 text-sm shadow-lg";
const BOTTOM_SHEET_ERROR_CLASS =
  "absolute inset-x-0 bottom-0 z-[4] grid gap-3 border-t bg-background p-4 text-sm shadow-lg";
const CARD_ERROR_CLASS =
  "grid w-56 gap-3 rounded-md border bg-background/95 p-3 text-xs shadow-md backdrop-blur-sm";
const FUNDS_PERSONALITY = MEADOW_SHEET_PERSONALITIES.funds;

type CoordinatePickMode = {
  label: string;
  callback: (coord: { lat: number; lon: number }) => void;
};

type DebugOpenSource = {
  source: string;
  sourceLabel: string;
};

const UNKNOWN_DEBUG_SOURCE: DebugOpenSource = {
  source: "unknown",
  sourceLabel: "Unknown",
};

function isFiniteLngLatBounds(
  bounds: [[number, number], [number, number]],
) {
  return bounds.every(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------


function CheckpointMarkers({
  map,
  checkpoints,
  onCheckpointClick,
}: {
  map: maplibregl.Map | null;
  checkpoints: Checkpoint[];
  onCheckpointClick: (checkpoint: Checkpoint) => void;
}) {
  const markersRef = useRef<Marker[]>([]);
  const onClickRef = useRef(onCheckpointClick);
  onClickRef.current = onCheckpointClick;

  useEffect(() => {
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = checkpoints.filter((cp) => cp.lat !== undefined && cp.lon !== undefined).map((checkpoint) => {
      const marker = new maplibregl.Marker({ color: "#d92332" })
        .setLngLat([checkpoint.lon!, checkpoint.lat!])
        .addTo(map);

      const el = marker.getElement();
      el.style.cursor = "pointer";
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onClickRef.current(checkpoint);
      });

      return marker;
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  // onCheckpointClick intentionally omitted — kept fresh via onClickRef

  }, [map, checkpoints]);

  return null;
}

function TravelerLocationMarker({
  map,
  position,
  isPulsing,
}: {
  map: maplibregl.Map | null;
  position: { lat: number; lon: number } | null;
  isPulsing?: boolean;
}) {
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!position) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const markerClassName = isPulsing
      ? "traveler-location-marker traveler-location-marker--pulsing"
      : "traveler-location-marker";

    if (markerRef.current) {
      markerRef.current.setLngLat([position.lon, position.lat]);
      markerRef.current.getElement().className = markerClassName;
    } else {
      const el = document.createElement("div");
      el.className = markerClassName;

      const ring = document.createElement("div");
      ring.className = "traveler-location-ring";

      const dot = document.createElement("div");
      dot.className = "traveler-location-dot";

      el.appendChild(ring);
      el.appendChild(dot);

      markerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([position.lon, position.lat])
        .addTo(map);
    }

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, [map, position, isPulsing]);

  return null;
}

function ConvexCheckpointSheet({
  selectedCoordinate,
  token,
  onClose,
  prefill,
  transactionPrefill,
  onCheckpointCreated,
  onBack,
  debugSource,
}: {
  selectedCoordinate: SelectedCoordinate | null;
  token: string;
  onClose: () => void;
  prefill?: CheckpointPrefill;
  transactionPrefill?: {
    title?: string;
    localAmount?: number;
    currencyCode?: string;
    localCurrencyPerUsd?: number;
  };
  onCheckpointCreated?: (id: string, prefill?: CheckpointPrefill) => void;
  onBack?: () => void;
  debugSource?: DebugOpenSource;
}) {
  const log = useDebugLogger("ConvexCheckpointSheet", "src/features/map/TripMap.tsx");
  const addCheckpoint = useMutation(tripcastApi.checkpoints.addCheckpoint);
  const completeMissionAsStory = useMutation(
    tripcastApi.missions.travelerCompleteMissionAsStory,
  );
  const isFromMission = Boolean(prefill?.missionId);
  const badgeDefinitions = useQuery(
    tripcastApi.badges.listBadgeDefinitions,
    isFromMission ? { token } : "skip",
  );

  const [stateOpen, setStateOpen] = useState(false);
  const [awardBadgeType, setAwardBadgeType] = useState<BadgeType | null>(null);
  const [transactionState, setTransactionState] = useState<TravelFundsInlineState>(null);
  const [moodValue, setMoodValue] = useState<import("../../convex/tripcastApi").TravelerMoodValue | undefined>();
  const [energyLevel, setEnergyLevel] = useState<import("../../convex/tripcastApi").TravelerEnergyLevel | undefined>();
  const [stomachLevel, setStomachLevel] = useState<import("../../convex/tripcastApi").TravelerStomachLevel | undefined>();
  const [stressLevel, setStressLevel] = useState<import("../../convex/tripcastApi").TravelerStressLevel | undefined>();
  const [scheduleLevel, setScheduleLevel] = useState<import("../../convex/tripcastApi").TravelerSchedulePressureLevel | undefined>();
  const [quickNote, setQuickNote] = useState("");

  // Reset state fields when the sheet closes
  useEffect(() => {
    if (!selectedCoordinate) {
      setStateOpen(false);
      setMoodValue(undefined);
      setEnergyLevel(undefined);
      setStomachLevel(undefined);
      setStressLevel(undefined);
      setScheduleLevel(undefined);
      setQuickNote("");
      setTransactionState(null);
      setAwardBadgeType(null);
    }
  }, [selectedCoordinate]);

  async function handleSave(args: Omit<AddCheckpointArgs, "token">): Promise<string> {
    // Block save when the inline Travel Funds section is open with
    // partial/invalid data — surface the error rather than silently dropping
    // the transaction. AddCheckpointSheet's onSubmit catches and displays this.
    if (transactionState && "error" in transactionState) {
      throw new Error(transactionState.error);
    }
    const inlineTransaction =
      transactionState && "value" in transactionState
        ? transactionState.value
        : prefill?.transaction;
    if (prefill?.missionId && prefill.completeMission !== false) {
      if (args.lat === undefined || args.lon === undefined) {
        throw new Error("A map location is required to complete as story.");
      }
      return completeMissionAsStory({
        token,
        missionId: prefill.missionId,
        title: args.title,
        note: args.note,
        locationLabel: args.locationLabel,
        lat: args.lat,
        lon: args.lon,
        source: args.source,
        transaction: inlineTransaction,
        awardBadgeType: awardBadgeType ?? undefined,
      });
    }
    return addCheckpoint({
      ...args,
      token,
      moodValue,
      energyLevel,
      energyScore: energyLevel ? ENERGY_SCORE_FOR_LEVEL[energyLevel] : undefined,
      stomachLevel,
      stomachScore: stomachLevel ? STOMACH_SCORE_FOR_LEVEL[stomachLevel] : undefined,
      stressLevel,
      stressScore: stressLevel ? STRESS_SCORE_FOR_LEVEL[stressLevel] : undefined,
      schedulePressureLevel: scheduleLevel,
      statusNote: quickNote.trim() || undefined,
      transaction: inlineTransaction,
    });
  }

  function Chips<T extends string>({ values, labels, selected, onSelect }: { values: T[]; labels: Record<T, string>; selected: T | undefined; onSelect: (v: T) => void }) {
    return (
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onSelect(v)}
            className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${selected === v ? "bg-navy text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {labels[v]}
          </button>
        ))}
      </div>
    );
  }

  const stateSection = (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => setStateOpen((p) => !p)}
        className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <span>{stateOpen ? "▾" : "▸"}</span> Also update Traveler State
      </button>
      {stateOpen && (
        <div className="grid gap-3 rounded-md border bg-muted/20 p-3 text-sm">
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Mood</span>
            <Chips values={MOOD_VALUES} labels={MOOD_LABELS} selected={moodValue} onSelect={setMoodValue} />
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Energy</span>
            <Chips values={ENERGY_VALUES} labels={ENERGY_LABELS} selected={energyLevel} onSelect={setEnergyLevel} />
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Stomach</span>
            <Chips values={STOMACH_VALUES} labels={STOMACH_LABELS} selected={stomachLevel} onSelect={setStomachLevel} />
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Stress</span>
            <Chips values={STRESS_VALUES} labels={STRESS_LABELS} selected={stressLevel} onSelect={setStressLevel} />
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Schedule</span>
            <Chips values={SCHEDULE_VALUES} labels={SCHEDULE_LABELS} selected={scheduleLevel} onSelect={setScheduleLevel} />
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Note</span>
            <textarea
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value.slice(0, 240))}
              rows={2}
              placeholder="How are you doing?"
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm resize-none"
            />
            <span className="text-right text-xs text-muted-foreground">{quickNote.length}/240</span>
          </div>
        </div>
      )}
      {isFromMission && (
        <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-sm">
          <span className="text-xs font-semibold text-muted-foreground">
            Award a badge to the creator?{" "}
            <span className="font-normal">(optional)</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setAwardBadgeType(null)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                awardBadgeType === null
                  ? "bg-navy text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              None
            </button>
            {(badgeDefinitions ?? []).map((b) => (
              <button
                key={b.badgeType}
                type="button"
                onClick={() => {
                  setAwardBadgeType(b.badgeType);
                  log.logInteraction("badge:complete-as-story:select", {
                    badgeType: b.badgeType,
                  });
                }}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  awardBadgeType === b.badgeType
                    ? "bg-navy text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <span aria-hidden>{b.emoji}</span> {b.name}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            The badge is awarded to the Follower(s) credited on this Mission.
          </p>
        </div>
      )}
      <TravelFundsInlineSection
        token={token}
        prefill={transactionPrefill}
        onChange={setTransactionState}
      />
    </div>
  );

  return (
    <AddCheckpointSheet
      selectedCoordinate={selectedCoordinate}
      onClose={onClose}
      onSave={handleSave}
      stateSection={stateSection}
      prefill={prefill}
      onCheckpointCreated={onCheckpointCreated}
      onBack={onBack}
      debugSource={debugSource}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type LastSentLocation = { lat: number; lon: number; sentAt: number } | null;

type TripMapProps = {
  token: string;
  role: Role;
  locationResetNonce?: number;
  tripDataResetNonce?: number;
  onOpenDebugPanel?: () => void;
};

export default function TripMap({
  token,
  role,
  locationResetNonce = 0,
  tripDataResetNonce = 0,
  onOpenDebugPanel,
}: TripMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const placementModeRef = useRef(false);
  const browserLocationWatchRef = useRef<number | null>(null);
  const isLocationSharingRef = useRef(false);
  const lastSentLocationRef = useRef<LastSentLocation>(null);
  const coordinatePickModeRef = useRef<CoordinatePickMode | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardsWrapperRef = useRef<HTMLDivElement>(null);
  const music = useMusicSafe();
  const musicRef = useRef(music);
  const log = useDebugLogger("TripMap", "src/features/map/TripMap.tsx");

  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [selectedCoordinate, setSelectedCoordinate] = useState<SelectedCoordinate | null>(null);
  const [isPlacementMode, setIsPlacementMode] = useState(false);
  const [isVotePanelOpen, setIsVotePanelOpen] = useState(false);
  const [isTravelerStateOpen, setIsTravelerStateOpen] = useState(false);
  const [voteMapOverlay, setVoteMapOverlay] = useState<RouteVoteMapOverlayType | null>(null);
  const [voteOptionNumberById, setVoteOptionNumberById] = useState<Record<string, number> | null>(null);
  const [isLocationSharing, setIsLocationSharing] = useState(false);
  const [livePosition, setLivePosition] = useState<{ lat: number; lon: number } | null>(null);
  const [coordinatePickMode, setCoordinatePickMode] = useState<CoordinatePickMode | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [selectedStoryEvent, setSelectedStoryEvent] = useState<JournalEvent | null>(null);
  const [storyOpenedFromJournal, setStoryOpenedFromJournal] = useState(false);
  const [isSetActivityOpen, setIsSetActivityOpen] = useState(false);
  const [isTravelFundsSheetOpen, setIsTravelFundsSheetOpen] = useState(false);
  const [isAchievementsOpen, setIsAchievementsOpen] = useState(false);
  const [isMissionsPanelOpen, setIsMissionsPanelOpen] = useState(false);
  const [journalDebugSource, setJournalDebugSource] = useState<DebugOpenSource>(UNKNOWN_DEBUG_SOURCE);
  const [missionsDebugSource, setMissionsDebugSource] = useState<DebugOpenSource>(UNKNOWN_DEBUG_SOURCE);
  const [votesDebugSource, setVotesDebugSource] = useState<DebugOpenSource>(UNKNOWN_DEBUG_SOURCE);
  const [fundsDebugSource, setFundsDebugSource] = useState<DebugOpenSource>(UNKNOWN_DEBUG_SOURCE);
  const [activityDebugSource, setActivityDebugSource] = useState<DebugOpenSource>(UNKNOWN_DEBUG_SOURCE);
  const [storyDebugSource, setStoryDebugSource] = useState<DebugOpenSource>(UNKNOWN_DEBUG_SOURCE);
  const [checkInDebugSource, setCheckInDebugSource] = useState<DebugOpenSource>(UNKNOWN_DEBUG_SOURCE);
  const [pendingOpenMissionId, setPendingOpenMissionId] = useState<string | null>(null);
  const [missionPrefillCoordinate, setMissionPrefillCoordinate] = useState<{ lat: number; lon: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lat: number; lon: number } | null>(null);
  // Mission Complete-as-Story flow: when the Traveler picks the "Complete as story"
  // branch in a mission detail, this prefill seeds AddCheckpointSheet with the
  // mission's title/location and carries the missionId through so we can call
  // `travelerCompleteMission` after the resulting story lands.
  const [storyPrefill, setStoryPrefill] = useState<CheckpointPrefill | null>(null);
  // Set alongside `storyPrefill` so hitting "← Back" inside the story sheet
  // can reopen MissionsPanel directly on the originating mission's detail
  // view (the four-button action set the Traveler expects to return to).
  const [pendingOpenDetailMissionId, setPendingOpenDetailMissionId] = useState<string | null>(null);
  const [pendingOpenVoteId, setPendingOpenVoteId] = useState<string | null>(null);
  const canWrite = role === "traveler";

  const updateTravelerLocation = useMutation(tripcastApi.travelerLocations.updateTravelerLocation);
  const stopTravelerLocationSharing = useMutation(
    tripcastApi.travelerLocations.stopTravelerLocationSharing,
  );
  const checkpoints = useQuery(tripcastApi.checkpoints.listCheckpoints, { token }) ?? [];
  const storedTravelerLocation = useQuery(tripcastApi.travelerLocations.getTravelerLocation, {
    token,
  });

  const [showTripPathLocal, setShowTripPathLocal] = useState(() => {
    const val = localStorage.getItem("tripcast.showTripPath");
    return val === null ? true : val === "true";
  });

  useEffect(() => {
    const handler = () => {
      const val = localStorage.getItem("tripcast.showTripPath");
      setShowTripPathLocal(val === null ? true : val === "true");
    };
    window.addEventListener("tripcast.preferencesUpdated", handler);
    return () => window.removeEventListener("tripcast.preferencesUpdated", handler);
  }, []);

  const followerPreferences = useQuery(tripcastApi.travelerPreferences.followerGetPreferences, role === "follower" ? { token } : "skip");

  const showPath = role === "traveler"
    ? showTripPathLocal
    : (followerPreferences?.visible ? ((followerPreferences as any).allowFollowersTripPath ?? false) : false);

  useTripPath(
    mapInstance,
    checkpoints,
    livePosition ?? (role === "follower" ? (storedTravelerLocation ? { lat: storedTravelerLocation.lat, lon: storedTravelerLocation.lon } : null) : null),
    showPath
  );

  const journalEvents = useQuery(tripcastApi.journalEvents.listJournalEvents, { token }) ?? [];
  const { unreadCount, markAllRead } = useJournalUnread(journalEvents);

  const allMissionsForBadge = useQuery(
    tripcastApi.missions.travelerListMissions,
    role === "traveler" ? { token } : "skip",
  );
  const followerMissions = useQuery(
    tripcastApi.missions.followerListMissions,
    role === "follower" ? { token } : "skip",
  );
  const missionBadgeCount =
    role === "traveler"
      ? (allMissionsForBadge ?? []).filter((c) => c.status === "proposed").length
      : 0;
  const missionsForLookup = role === "traveler" ? allMissionsForBadge : followerMissions;

  const voteAlert = useQuery(tripcastApi.routeVotes.getActiveRouteVoteAlert, { token });
  const hasUnseenVote = voteAlert?.hasUnseen ?? false;

  const [fanOpen, setFanOpen] = useState(false);
  const isDesktop = useIsDesktop();

  // Re-measure the map canvas when the desktop/mobile layout switches so
  // MapLibre doesn't show a blank canvas after the container changes size.
  useEffect(() => {
    if (!mapRef.current) return;
    const id = requestAnimationFrame(() => { mapRef.current?.resize(); });
    return () => cancelAnimationFrame(id);
  }, [isDesktop]);

  useTripAudioScenario({
    token,
    role,
    storyOpen: selectedStoryEvent !== null || storyPrefill !== null,
    voteActive: isVotePanelOpen || hasUnseenVote,
    missionActive: isMissionsPanelOpen || isSetActivityOpen || missionBadgeCount > 0,
  });

  useEffect(() => {
    musicRef.current = music;
  }, [music]);

  function openJournal(debugSource: DebugOpenSource = UNKNOWN_DEBUG_SOURCE) {
    if (isJournalOpen) {
      log.logInteraction("panel:close", { panel: "journal" });
      music.sfx("close");
      setIsJournalOpen(false);
      return;
    }
    setJournalDebugSource(debugSource);
    log.logInteraction("panel:open", { panel: "journal" });
    performance.mark("tripcast:debug:journal:open");
    music.sfx("open");
    setIsJournalOpen(true);
    setIsMissionsPanelOpen(false);
    setIsVotePanelOpen(false);
    setIsTravelFundsSheetOpen(false);
    setIsAchievementsOpen(false);
  }
  function openMissions(debugSource: DebugOpenSource = UNKNOWN_DEBUG_SOURCE) {
    if (isMissionsPanelOpen) {
      log.logInteraction("panel:close", { panel: "Missions" });
      music.sfx("close");
      setIsMissionsPanelOpen(false);
      return;
    }
    setMissionsDebugSource(debugSource);
    log.logInteraction("panel:open", { panel: "Missions" });
    performance.mark("tripcast:debug:Missions:open");
    music.sfx("open");
    setIsMissionsPanelOpen(true);
    setIsJournalOpen(false);
    setIsVotePanelOpen(false);
    setIsTravelFundsSheetOpen(false);
    setIsAchievementsOpen(false);
  }
  function openVotes(debugSource: DebugOpenSource = UNKNOWN_DEBUG_SOURCE) {
    if (isVotePanelOpen) {
      log.logInteraction("panel:close", { panel: "votes" });
      music.sfx("close");
      setIsVotePanelOpen(false);
      return;
    }
    setVotesDebugSource(debugSource);
    log.logInteraction("panel:open", { panel: "votes" });
    performance.mark("tripcast:debug:votes:open");
    music.sfx("open");
    setIsVotePanelOpen(true);
    setIsJournalOpen(false);
    setIsMissionsPanelOpen(false);
    setIsTravelFundsSheetOpen(false);
    setIsAchievementsOpen(false);
  }
  function openFunds(debugSource: DebugOpenSource = UNKNOWN_DEBUG_SOURCE) {
    if (isTravelFundsSheetOpen) {
      log.logInteraction("panel:close", { panel: "funds" });
      music.sfx("close");
      setIsTravelFundsSheetOpen(false);
      return;
    }
    setFundsDebugSource(debugSource);
    log.logInteraction("panel:open", { panel: "funds" });
    performance.mark("tripcast:debug:funds:open");
    music.sfx("open");
    setIsTravelFundsSheetOpen(true);
    setIsJournalOpen(false);
    setIsMissionsPanelOpen(false);
    setIsVotePanelOpen(false);
    setIsAchievementsOpen(false);
  }
  function openAchievements() {
    if (isAchievementsOpen) {
      log.logInteraction("panel:close", { panel: "achievements" });
      music.sfx("close");
      setIsAchievementsOpen(false);
      return;
    }
    log.logInteraction("panel:open", { panel: "achievements" });
    performance.mark("tripcast:debug:achievements:open");
    music.sfx("open");
    setIsAchievementsOpen(true);
    setIsJournalOpen(false);
    setIsMissionsPanelOpen(false);
    setIsVotePanelOpen(false);
    setIsTravelFundsSheetOpen(false);
  }

  const forceOpenMissions = useCallback((debugSource: DebugOpenSource = UNKNOWN_DEBUG_SOURCE) => {
    setMissionsDebugSource(debugSource);
    setIsMissionsPanelOpen(true);
    setIsJournalOpen(false);
    setIsVotePanelOpen(false);
    setIsTravelFundsSheetOpen(false);
    setIsAchievementsOpen(false);
  }, []);

  const activeDockTab: DockTab | null = isJournalOpen
    ? "journal"
    : isMissionsPanelOpen
      ? "missions"
      : isVotePanelOpen
        ? "votes"
        : isTravelFundsSheetOpen
          ? "funds"
          : isAchievementsOpen
            ? "achievements"
            : null;

  function handleDockSelect(tab: DockTab) {
    setFanOpen(false);
    setIsTravelerStateOpen(false);
    if (tab === "journal") openJournal({ source: "dock:journal", sourceLabel: "Dock -> Journal" });
    else if (tab === "missions") openMissions({ source: "dock:missions", sourceLabel: "Dock -> Missions" });
    else if (tab === "votes") openVotes({ source: "dock:votes", sourceLabel: "Dock -> Votes" });
    else if (tab === "funds") openFunds({ source: "dock:funds", sourceLabel: "Dock -> Funds" });
    else if (tab === "achievements") openAchievements();
  }

  function handleDockAdd() {
    music.sfx("tap");
    setFanOpen((prev) => !prev);
  }

  function handleFanPick(action: FanAction) {
    music.sfx("tap");
    setFanOpen(false);
    switch (action) {
      case "checkin":
        log.logInteraction("placement:enter", { trigger: "fan:checkin" });
        performance.mark("tripcast:debug:placement:enter");
        setCheckInDebugSource({ source: "fan-menu:checkin", sourceLabel: "FanMenu -> Check In" });
        setSelectedCoordinate(null);
        setIsPlacementMode(true);
        break;
      case "activity":
        music.sfx("open");
        setActivityDebugSource({ source: "fan-menu:activity", sourceLabel: "FanMenu -> Activity" });
        setIsSetActivityOpen(true);
        break;
      case "transaction":
        openFunds({ source: "fan-menu:transaction", sourceLabel: "FanMenu -> Add Transaction" });
        break;
      case "mission":
        openMissions({ source: "fan-menu:mission", sourceLabel: "FanMenu -> Add Mission" });
        break;
      case "vote":
        openVotes({ source: "fan-menu:vote", sourceLabel: "FanMenu -> Add Vote" });
        break;
    }
  }

  // Keep placement mode ref in sync
  useEffect(() => {
    placementModeRef.current = isPlacementMode;
  }, [isPlacementMode]);

  const cancelCoordinatePick = useCallback(() => {
    log.logInteraction("coordinate:pick-mode:cancel");
    coordinatePickModeRef.current = null;
    setCoordinatePickMode(null);
  }, [log]);

  // ESC cancels coordinate pick mode
  useEffect(() => {
    if (!coordinatePickMode) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") cancelCoordinatePick();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [coordinatePickMode, cancelCoordinatePick]);

  // Map init
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: OPEN_FREE_MAP_STYLE,
      center: SEATTLE_CENTER,
      zoom: 11,
      minZoom: 2,
      maxZoom: 18,
      collectResourceTiming: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");

    map.on("contextmenu", (event) => {
      event.preventDefault();
      const { lat, lng: lon } = event.lngLat;
      const point = map.project(event.lngLat);
      log.logUi("map:context-menu:open", { lat, lon, trigger: "right-click" });
      setContextMenu({ x: point.x, y: point.y, lat, lon });
    });

    let touchTimer: ReturnType<typeof setTimeout> | null = null;
    map.on("touchstart", (e) => {
      if (e.points.length > 1) return;
      touchTimer = setTimeout(() => {
        const { lat, lng: lon } = e.lngLat;
        const point = map.project(e.lngLat);
        log.logUi("map:context-menu:open", { lat, lon, trigger: "long-press" });
        setContextMenu({ x: point.x, y: point.y, lat, lon });
      }, 600);
    });
    map.on("touchend", () => touchTimer && clearTimeout(touchTimer));
    map.on("touchmove", () => touchTimer && clearTimeout(touchTimer));
    map.on("mousedown", () => setContextMenu(null));
    map.on("dragstart", () => setContextMenu(null));
    map.on("zoomstart", () => setContextMenu(null));

    map.on("click", (event) => {
      setContextMenu(null);
      if (isEnabled() && isCategoryEnabled("interaction")) {
        const features = map.queryRenderedFeatures(event.point);
        rawLog("info", "TripMap", "map:click", "interaction", {
          screenX: Math.round(event.point.x),
          screenY: Math.round(event.point.y),
          viewportW: map.getContainer().clientWidth,
          viewportH: map.getContainer().clientHeight,
          lat: parseFloat(event.lngLat.lat.toFixed(5)),
          lon: parseFloat(event.lngLat.lng.toFixed(5)),
          zoom: parseFloat(map.getZoom().toFixed(2)),
          pointerType: (event.originalEvent as PointerEvent).pointerType || undefined,
          featuresHit: features.slice(0, 5).map((f) => ({ id: f.id, source: f.source, layer: f.layer?.id })),
          markerHit: features.length > 0,
        });
      }

      // Coordinate pick mode takes priority
      if (coordinatePickModeRef.current) {
        const pick = coordinatePickModeRef.current;
        coordinatePickModeRef.current = null;
        setCoordinatePickMode(null);
        log.logInteraction("coordinate:picked", { lat: event.lngLat.lat, lon: event.lngLat.lng, source: "coordinate-pick" });
        musicRef.current.sfx("pin");
        pick.callback({ lat: event.lngLat.lat, lon: event.lngLat.lng });
        return;
      }

      if (!placementModeRef.current) return;
      log.logInteraction("coordinate:picked", { lat: event.lngLat.lat, lon: event.lngLat.lng, source: "placement" });
      setIsPlacementMode(false);
      musicRef.current.sfx("pin");
      setCheckInDebugSource({ source: "fan-menu:checkin", sourceLabel: "FanMenu -> Check In" });
      setSelectedCoordinate({
        lat: event.lngLat.lat,
        lon: event.lngLat.lng,
        source: "tap_add_mode",
      });
    });

    mapRef.current = map;
    setMapInstance(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [canWrite, forceOpenMissions, role]);

  useEffect(() => {
    isLocationSharingRef.current = isLocationSharing;
  }, [isLocationSharing]);

  // Track the traveler's own browser location locally. Sharing only controls publishing.
  useEffect(() => {
    if (role !== "traveler" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        setLivePosition({ lat, lon });

        if (!isLocationSharingRef.current) return;
        publishTravelerLocation({ lat, lon }, accuracy ?? undefined);
      },
      () => {},
      { enableHighAccuracy: true },
    );

    browserLocationWatchRef.current = watchId;

    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (browserLocationWatchRef.current === watchId) {
        browserLocationWatchRef.current = null;
      }
    };
  // publishTravelerLocation only uses refs plus stable mutation inputs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, token]);

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (locationResetNonce === 0) return;
    stopLocationSharing();
  // stopLocationSharing only touches refs + stable mutation handles; its
  // identity changes per render but its behavior is closure-stable here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationResetNonce]);

  useEffect(() => {
    if (role !== "traveler") return;

    function handlePageHide() {
      if (!isLocationSharingRef.current) return;
      stopTravelerLocationSharing({ token }).catch(() => {});
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [role, stopTravelerLocationSharing, token]);

  useEffect(() => {
    if (tripDataResetNonce === 0) return;
    setIsVotePanelOpen(false);
    setVoteMapOverlay(null);
    setVoteOptionNumberById(null);
    setCoordinatePickMode(null);
    coordinatePickModeRef.current = null;
    setIsJournalOpen(false);
    setIsAchievementsOpen(false);
    setSelectedStoryEvent(null);
  }, [tripDataResetNonce]);

  function publishTravelerLocation(
    position: { lat: number; lon: number },
    accuracy?: number,
  ) {
    const last = lastSentLocationRef.current;
    const now = Date.now();
    const moved =
      !last ||
      Math.abs(position.lat - last.lat) > 0.0001 ||
      Math.abs(position.lon - last.lon) > 0.0001 ||
      now - last.sentAt > 30_000;
    if (!moved) return;

    lastSentLocationRef.current = {
      lat: position.lat,
      lon: position.lon,
      sentAt: now,
    };
    updateTravelerLocation({
      token,
      lat: position.lat,
      lon: position.lon,
      accuracy,
    }).catch(() => {});
  }

  function stopLocationSharing() {
    isLocationSharingRef.current = false;
    lastSentLocationRef.current = null;
    setIsLocationSharing(false);
    stopTravelerLocationSharing({ token }).catch(() => {});
  }

  function handleToggleLocationSharing() {
    music.sfx("tap");
    if (isLocationSharing) {
      stopLocationSharing();
    } else {
      isLocationSharingRef.current = true;
      setIsLocationSharing(true);
      if (livePosition) {
        publishTravelerLocation(livePosition);
      }
    }
  }

  function handleRequestCoordinatePick(
    optionIndex: number,
    callback: (coord: { lat: number; lon: number }) => void,
  ) {
    log.logInteraction("coordinate:pick-mode:enter", { source: "route-vote", optionIndex });
    music.sfx("page");
    const label = `Option ${optionIndex + 1} location`;
    coordinatePickModeRef.current = { label, callback };
    setCoordinatePickMode({ label, callback });
  }

  function handleNavigateToMission(coord: { lat: number; lon: number }) {
    if (!mapRef.current) return;
    log.logInteraction("map:camera:move", { lat: coord.lat, lon: coord.lon, trigger: "Mission:location-focus" });
    // Offset the target so it appears in the visible area to the right of the
    // 320px panel and above the bottom detail sheet (~300px).
    mapRef.current.flyTo({
      center: [coord.lon, coord.lat],
      zoom: Math.max(mapRef.current.getZoom(), 14),
      padding: { top: 60, right: 60, bottom: 320, left: 380 },
    });
  }

  function handleNavigateToVote(voteId: string) {
    log.logInteraction("panel:navigate", { from: "Missions", to: "votes", voteId });
    music.sfx("page");
    setVotesDebugSource({ source: "missions:linked-vote", sourceLabel: "Missions -> Route Vote" });
    setIsMissionsPanelOpen(false);
    setIsVotePanelOpen(true);
    setIsJournalOpen(false);
    setIsTravelFundsSheetOpen(false);
    setIsAchievementsOpen(false);
    setPendingOpenVoteId(voteId);
  }

  function handleNavigateToMissionDetail(
    missionId: string,
    debugSource: DebugOpenSource = { source: "votes:linked-mission", sourceLabel: "Votes -> Mission" },
  ) {
    log.logInteraction("panel:navigate", { from: "votes", to: "Missions", missionId });
    music.sfx("page");
    setMissionsDebugSource(debugSource);
    setIsVotePanelOpen(false);
    setVoteMapOverlay(null);
    setVoteOptionNumberById(null);
    setIsMissionsPanelOpen(true);
    setIsJournalOpen(false);
    setIsTravelFundsSheetOpen(false);
    setIsAchievementsOpen(false);
    setPendingOpenDetailMissionId(missionId);
  }

  function handleOpenLinkedStory(event: JournalEvent) {
    log.logInteraction("panel:navigate", { from: "Missions", to: "story", eventId: event._id });
    music.sfx("page");
    setStoryDebugSource({ source: "missions:linked-story", sourceLabel: "Missions -> Story" });
    setSelectedStoryEvent(event);
  }

  function handleOpenMissionFromStory(missionId: string) {
    log.logInteraction("panel:navigate", { from: "story", to: "Missions", missionId });
    setSelectedStoryEvent(null);
    handleNavigateToMissionDetail(missionId, { source: "story-detail:mission", sourceLabel: "Story detail -> Mission" });
  }

  function handleRequestMissionCoordinatePick(
    callback: (coord: { lat: number; lon: number }) => void,
  ) {
    log.logInteraction("coordinate:pick-mode:enter", { source: "Mission" });
    music.sfx("page");
    const label = "the mission location";
    coordinatePickModeRef.current = { label, callback };
    setCoordinatePickMode({ label, callback });
  }

  function handleRequestStoryCoordinatePick(
    callback: (coord: { lat: number; lon: number }) => void,
  ) {
    log.logInteraction("coordinate:pick-mode:enter", { source: "Story" });
    music.sfx("page");
    const label = "the story location";
    coordinatePickModeRef.current = { label, callback };
    setCoordinatePickMode({ label, callback });
  }

  function handleVoteOverlayChange(
    overlay: RouteVoteMapOverlayType | null,
    optionNumberById?: Record<string, number> | null,
  ) {
    setVoteMapOverlay(overlay);
    setVoteOptionNumberById(optionNumberById ?? null);
  }

  // NOTE: the activity-complete-as-checkin flow (handleCompleteAsCheckIn +
  // handleCheckpointCreated + activityToComplete state) was removed when the
  // CurrentActivityCard came out with the legacy chrome. The Mission
  // Complete-as-Story flow below (Part 8) replaces it for the mission case;
  // an explicit "complete this freeform activity as a Story" flow can be
  // re-added in a later pass if the SetActivitySheet refresh wants it.

  function handleCompleteAsStory(Mission: {
    _id: string;
    status?: string;
    title?: string;
    description?: string;
    locationLabel?: string;
    lat?: number;
    lon?: number;
  }, transaction?: import("../../convex/tripcastApi").TransactionInlineInput) {
    music.sfx("page");
    setCheckInDebugSource({ source: "missions:complete-as-story", sourceLabel: "Mission detail -> Complete as Story" });
    setIsMissionsPanelOpen(false);
    setStoryPrefill({
      missionId: Mission._id,
      completeMission: Mission.status === "in_progress",
      title: Mission.title,
      note: Mission.description,
      locationLabel: Mission.locationLabel,
      transaction,
    });
    // Remember which mission to land on if the Traveler backs out of the story
    // form — the MissionPanel re-opens directly on this detail view.
    setPendingOpenDetailMissionId(Mission._id);
    if (Mission.lat !== undefined && Mission.lon !== undefined) {
      setSelectedCoordinate({
        lat: Mission.lat,
        lon: Mission.lon,
        source: "current_activity",
      });
    } else {
      // Mission has no location yet — drop the Traveler into placement mode so
      // they can tap where the story actually happened.
      setIsPlacementMode(true);
      showToast("Tap the map where the mission wrapped up.");
    }
  }

  function handleBackFromStory() {
    music.sfx("page");
    // "← Back" inside AddCheckpointSheet's mission-completion mode: dismiss
    // the story form (clears prefill + coordinate), then re-open the missions
    // panel; MissionPanel reads `pendingOpenDetailMissionId` and lands on
    // the originating mission's detail view (the full four-button set).
    setStoryPrefill(null);
    setSelectedCoordinate(null);
    setIsPlacementMode(false);
    setMissionsDebugSource({ source: "story-form:back", sourceLabel: "Back button" });
    setIsMissionsPanelOpen(true);
  }

  function handleStoryCheckpointCreated(_id: string, prefill?: CheckpointPrefill) {
    setStoryPrefill(null);
    setPendingOpenDetailMissionId(null);
    if (prefill?.completeMission) {
      music.sfx("success");
      showToast("Mission completed.");
    } else if (prefill?.missionId) {
      music.sfx("success");
      showToast("Story added to mission.");
    }
  }


  function showToast(message: string) {
    music.sfx("toast");
    if (toastTimeoutRef.current !== null) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3200);
  }

  function centerMapOnCoordinate(coordinate: { lat: number; lon: number }) {
    const map = mapRef.current;
    if (!map) return;
    log.logInteraction("map:camera:move", { lat: coordinate.lat, lon: coordinate.lon, trigger: "center:location" });
    // Reset any persistent padding set by handleNavigateToMission before easing
    map.easeTo({
      center: [coordinate.lon, coordinate.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 700,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  }

  // Panel-aware focus: positions the pin in the visible map above the journal sheet.
  // The journal sheet is max-h-[50dvh], so apply matching bottom padding so the pin
  // lands in the vertical center of the exposed map area rather than behind the panel.
  function handleHistoryLocationFocus(coordinate: { lat: number; lon: number }) {
    const map = mapRef.current;
    if (!map) return;
    log.logInteraction("map:camera:move", { lat: coordinate.lat, lon: coordinate.lon, trigger: "journal:location-focus" });
    const mapHeight = map.getContainer().clientHeight;
    map.easeTo({
      center: [coordinate.lon, coordinate.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 700,
      padding: { top: 60, right: 60, bottom: Math.round(mapHeight * 0.55), left: 60 },
    });
  }

  function handleStoryDetailLocationFocus(coordinate: { lat: number; lon: number }) {
    const map = mapRef.current;
    if (!map) return;
    log.logInteraction("map:camera:move", { lat: coordinate.lat, lon: coordinate.lon, trigger: "story-detail:location-focus" });
    const mapContainer = map.getContainer();
    const mapHeight = mapContainer.clientHeight;
    const mapWidth = mapContainer.clientWidth;
    const mapRect = mapContainer.getBoundingClientRect();
    const cardsRect = cardsWrapperRef.current?.getBoundingClientRect();
    const cardsRight = cardsRect ? Math.round(cardsRect.right) : 0;
    const cardsBottom = cardsRect ? cardsRect.bottom : 0;

    // Measure actual rendered sheet height; fall back to 50% of mapHeight if not mounted yet.
    const sheetEl = document.querySelector('[data-role="story-detail"]') as HTMLElement | null;
    const rawSheetHeight = sheetEl?.offsetHeight ?? 0;
    const sheetHeight = rawSheetHeight > 0 ? rawSheetHeight : Math.round(mapHeight * 0.50);

    const topPad = 60;
    const rightPad = 60;
    const bottomPadding = sheetHeight + 30;
    const availableHeight = Math.max(mapHeight - bottomPadding - topPad, 50);

    // Only push the pin right of the cards when they cover the pin's natural
    // center BOTH horizontally AND vertically. On wide screens or when cards
    // are scrolled above the pin, no offset is needed.
    const pinNaturalY_inViewport = mapRect.top + topPad + availableHeight / 2;
    const cardsHorizontallyEncroach = cardsRight + 16 > mapWidth / 2;
    const cardsVerticallyOverlap = cardsBottom > pinNaturalY_inViewport;
    const leftPadding =
      cardsHorizontallyEncroach && cardsVerticallyOverlap ? cardsRight + 16 : rightPad;

    // Zoom so ~1200m fits in the available vertical space above the sheet.
    const targetMetersPerPixel = 1200 / availableHeight;
    const contextZoom = Math.log2(
      (156543.03392 * Math.cos((coordinate.lat * Math.PI) / 180)) / targetMetersPerPixel,
    );
    const zoom = Math.min(Math.max(contextZoom, 12), 16);

    map.easeTo({
      center: [coordinate.lon, coordinate.lat],
      zoom,
      duration: 700,
      padding: { top: topPad, right: rightPad, bottom: bottomPadding, left: leftPadding },
    });
  }

  function handleCenterLocation() {
    music.sfx("tap");
    const currentLocation =
      role === "traveler"
        ? (livePosition ?? storedTravelerLocation ?? null)
        : (storedTravelerLocation ?? null);

    if (currentLocation) {
      centerMapOnCoordinate(currentLocation);
      return;
    }

    const lastCheckpoint = checkpoints[checkpoints.length - 1];
    if (lastCheckpoint?.lat !== undefined && lastCheckpoint.lon !== undefined) {
      centerMapOnCoordinate(lastCheckpoint as { lat: number; lon: number });
      return;
    }

    showToast("Traveler location is unknown.");
  }

  function handleRequestFitMap(
    bounds: [[number, number], [number, number]] | null,
    paddingBottom?: number,
  ) {
    if (!mapRef.current || !bounds) return;
    if (!isFiniteLngLatBounds(bounds)) return;
    const bottom = paddingBottom ?? 80;
    log.logInteraction("map:camera:fitbounds", {
      sw: { lon: bounds[0][0], lat: bounds[0][1] },
      ne: { lon: bounds[1][0], lat: bounds[1][1] },
      paddingBottom: bottom,
      trigger: "route-vote",
    });
    mapRef.current.fitBounds(bounds, {
      padding: { top: 80, right: 80, bottom, left: 80 },
      maxZoom: 14,
    });
  }

  const mapClassName = useMemo(
    () =>
      isPlacementMode || coordinatePickMode
        ? "h-full min-h-[420px] w-full cursor-crosshair"
        : "h-full min-h-[420px] w-full",
    [isPlacementMode, coordinatePickMode],
  );

  const isPickingCoordinate = coordinatePickMode !== null;

  const latestCheckpoint = checkpoints.at(-1) ?? null;
  const latestCheckpointLat = latestCheckpoint?.lat;
  const latestCheckpointLon = latestCheckpoint?.lon;
  const routeVoteFallbackOrigin = useMemo(() => {
    if (role === "traveler" && isFiniteRouteCoordinate(livePosition)) {
      return livePosition;
    }
    if (
      typeof latestCheckpointLat === "number" &&
      Number.isFinite(latestCheckpointLat) &&
      typeof latestCheckpointLon === "number" &&
      Number.isFinite(latestCheckpointLon)
    ) {
      return { lat: latestCheckpointLat, lon: latestCheckpointLon };
    }
    return null;
  }, [latestCheckpointLat, latestCheckpointLon, livePosition, role]);

  return (
    <section className="relative min-h-0 flex-1 overflow-hidden" aria-label="Checkpoint map">
      <DesktopMapFrame
        isDesktop={isDesktop}
        activeDockTab={activeDockTab}
        onDockSelect={handleDockSelect}
        onAdd={handleDockAdd}
        fanOpen={fanOpen}
        role={role}
        badges={{
          journal: unreadCount,
          missions: missionBadgeCount,
          votes: hasUnseenVote ? 1 : 0,
          votesPulsing: hasUnseenVote,
        }}
        addLabel={role === "traveler" ? "Add" : `Propose ${TERMS.mission.toLowerCase()}`}
        showAdd={role === "traveler"}
        showAchievements
      >
      <div ref={mapContainerRef} className={mapClassName} />

      {/* Side-effect marker components */}
      <CheckpointMarkers
        map={mapInstance}
        checkpoints={checkpoints}
        onCheckpointClick={(checkpoint) => {
          if (isPlacementMode || coordinatePickMode) return;
          const event = journalEvents.find((e) => e.checkpointId === checkpoint._id);
          if (!event) return;
          music.sfx("page");
          setStoryOpenedFromJournal(false);
          setStoryDebugSource({ source: "story-pin", sourceLabel: "Story Pin" });
          setSelectedStoryEvent(event);
        }}
      />
      <TravelerLocationMarker
        map={mapInstance}
        isPulsing={
          role === "traveler" ? isLocationSharing : storedTravelerLocation !== null
        }
        position={
          role === "traveler"
            ? livePosition
            : (storedTravelerLocation ?? null)
        }
      />
      <RouteVoteMapOverlay
        key={tripDataResetNonce}
        map={mapInstance}
        overlay={isVotePanelOpen ? voteMapOverlay : null}
        fallbackOrigin={routeVoteFallbackOrigin}
        optionNumberById={voteOptionNumberById}
      />
      <MissionMarkers
        map={mapInstance}
        token={token}
        role={role}
        onMissionClick={(id) => {
          music.sfx("open");
          setIsMissionsPanelOpen(true);
          setIsAchievementsOpen(false);
          setPendingOpenMissionId(id);
        }}
      />

      {/* Placement / coordinate pick banners */}
      <AnimatePresence>
        {isPlacementMode && (
          <motion.div
            key="placement-banner"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" as const }}
            className="absolute left-1/2 top-4 z-[5] flex -translate-x-1/2 items-center gap-3 bg-navy text-white px-3 py-2.5 rounded-md shadow-lg max-w-[calc(100%-24px)]"
          >
            <span className="text-sm">Tap the map to place a pin.</span>
            <button
              type="button"
              className="rounded bg-white text-navy px-2.5 py-1 text-sm font-medium"
              onClick={() => { log.logInteraction("placement:cancel"); setIsPlacementMode(false); }}
            >
              Cancel
            </button>
          </motion.div>
        )}

        {coordinatePickMode && (
          <motion.div
            key="coordinate-pick-banner"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" as const }}
            className="absolute left-1/2 top-4 z-[5] flex -translate-x-1/2 items-center gap-3 bg-navy text-white px-3 py-2.5 rounded-md shadow-lg max-w-[calc(100%-24px)]"
          >
            <span className="text-sm">
              Tap the map to set {coordinatePickMode.label}.
            </span>
            <button
              type="button"
              className="rounded bg-white text-navy px-2.5 py-1 text-sm font-medium"
              onClick={cancelCoordinatePick}
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toastMessage && (
          <motion.div
            key="map-toast"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" as const }}
            role="status"
            className="absolute bottom-[112px] left-1/2 z-[6] -translate-x-1/2 rounded-md bg-navy px-4 py-2 text-sm font-medium text-white shadow-lg max-w-[calc(100%-24px)]"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {contextMenu && (
        <div
          className="absolute z-[100] min-w-[140px] rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] p-1 shadow-xl animate-in fade-in zoom-in-95 duration-100"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {role === "traveler" && (
            <button
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-[var(--bg-paper-2)] text-[var(--ink-1)]"
              onClick={(e) => {
                e.stopPropagation();
              log.logUi("map:context-menu:add-pin", { lat: contextMenu.lat, lon: contextMenu.lon });
                musicRef.current.sfx("pin");
                setCheckInDebugSource({ source: "map:context-menu", sourceLabel: "Context Menu -> Add Pin" });
                setSelectedCoordinate({
                  lat: contextMenu.lat,
                  lon: contextMenu.lon,
                  source: "right_click",
                });
                setContextMenu(null);
              }}
            >
              Add Pin
            </button>
          )}
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-[var(--bg-paper-2)] text-[var(--ink-1)]"
            onClick={(e) => {
              e.stopPropagation();
              const action = role === "traveler" ? "add-mission" : "propose-mission";
              log.logUi(`map:context-menu:${action}`, { 
                lat: contextMenu.lat, 
                lon: contextMenu.lon 
              });
              setMissionPrefillCoordinate({ lat: contextMenu.lat, lon: contextMenu.lon });
              forceOpenMissions({
                source: "map:context-menu",
                sourceLabel: role === "traveler" ? "Context Menu -> Add Mission" : "Context Menu -> Propose Mission",
              });
              setContextMenu(null);
            }}
          >
            {role === "traveler" ? "Add Mission" : "Propose Mission"}
          </button>
        </div>
      )}

      {/* Music mute indicator — top-right of the map */}
      <MusicMuteIndicator className="absolute right-3 top-3 z-[2]" />

      {/* Debug chip — only visible when debug logging is enabled */}
      {onOpenDebugPanel ? (
        <div className="absolute right-3 top-12 z-[3]">
          <DebugChip onOpen={onOpenDebugPanel} />
        </div>
      ) : null}

      {/* Map utility — center on traveler (replaces the LocateFixed FAB) */}
      <MapCenterButton
        className="absolute bottom-[88px] right-3 z-[2]"
        active={role === "traveler" ? isLocationSharing : storedTravelerLocation !== null}
        onClick={handleCenterLocation}
      />

      {/* Achievements sheet and queued toasts. The Dock owns the trigger. */}
      <FeatureBoundary
        resetKeys={[token, role, "achievements"]}
        title="Achievements hit a problem."
        message="Try again."
        fallbackClassName={CARD_ERROR_CLASS}
      >
        <AchievementsConnected
          token={token}
          open={isAchievementsOpen}
          onOpenChange={setIsAchievementsOpen}
          showButton={false}
        />
      </FeatureBoundary>

      {/* Bottom Dock */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[20] tripcast-frame">
        <Dock
          active={activeDockTab}
          onSelect={handleDockSelect}
          onAdd={handleDockAdd}
          fanOpen={fanOpen}
          addLabel={role === "traveler" ? "Add" : `Propose ${TERMS.mission.toLowerCase()}`}
          showAdd={role === "traveler"}
          showFunds={false}
          showAchievements
          badges={{
            journal: unreadCount,
            missions: missionBadgeCount,
            votes: hasUnseenVote ? 1 : 0,
            votesPulsing: hasUnseenVote,
          }}
        />
      </div>

      <FanMenu
        open={fanOpen && role === "traveler"}
        onClose={() => {
          music.sfx("close");
          setFanOpen(false);
        }}
        onPick={handleFanPick}
      />

      {/* Checkpoint add sheet */}
      {canWrite && (
        <ConvexCheckpointSheet
          selectedCoordinate={selectedCoordinate}
          token={token}
          onClose={() => {
            music.sfx("close");
            setSelectedCoordinate(null);
            setStoryPrefill(null);
            // Swipe-down / escape dismissal — drop the pending detail return
            // so a later unrelated open of the missions panel doesn't surprise
            // the Traveler by jumping to this mission's detail.
            setPendingOpenDetailMissionId(null);
          }}
          prefill={storyPrefill ?? undefined}
          transactionPrefill={storyPrefill?.transaction}
          onCheckpointCreated={handleStoryCheckpointCreated}
          onBack={storyPrefill?.missionId ? handleBackFromStory : undefined}
          debugSource={checkInDebugSource}
        />
      )}

      {/* Vote panels — kept mounted (not unmounted) during coordinate pick to
          preserve form state, and while closed so the close transition plays. */}
      {role === "follower" && (
          <FeatureBoundary
            resetKeys={[isVotePanelOpen, role, token]}
            onClose={() => {
              music.sfx("close");
              setIsVotePanelOpen(false);
              setVoteMapOverlay(null);
              setVoteOptionNumberById(null);
            }}
            title="Votes hit a problem."
            message="Try again, or close votes and reopen them."
            fallbackClassName={BOTTOM_SHEET_ERROR_CLASS}
          >
            <RouteVotePanel
              key="follower-vote-panel"
              open={isVotePanelOpen}
              token={token}
              onClose={() => {
                music.sfx("close");
                setIsVotePanelOpen(false);
                setVoteMapOverlay(null);
                setVoteOptionNumberById(null);
              }}
              onVoteOverlayChange={handleVoteOverlayChange}
              onRequestFitMap={handleRequestFitMap}
              fallbackOrigin={routeVoteFallbackOrigin}
              debugSource={votesDebugSource}
            />
          </FeatureBoundary>
      )}

      {role === "traveler" && (
        <FeatureBoundary
            resetKeys={[isVotePanelOpen, role, token]}
            onClose={() => {
              music.sfx("close");
              setIsVotePanelOpen(false);
              setVoteMapOverlay(null);
              setVoteOptionNumberById(null);
            }}
            title="Route votes hit a problem."
            message="Try again, or close votes and reopen them."
            fallbackClassName={PANEL_ERROR_CLASS}
          >
            <RouteVoteProgress
              open={isVotePanelOpen}
              token={token}
              onClose={() => {
                music.sfx("close");
                setIsVotePanelOpen(false);
                setVoteMapOverlay(null);
                setVoteOptionNumberById(null);
              }}
              onRequestCoordinatePick={handleRequestCoordinatePick}
              referenceLocation={livePosition}
              onVoteOverlayChange={handleVoteOverlayChange}
              onRequestFitMap={handleRequestFitMap}
              fallbackOrigin={routeVoteFallbackOrigin}
              isPickingCoordinate={isPickingCoordinate}
              pendingOpenVoteId={pendingOpenVoteId}
              onClearPendingVoteId={() => setPendingOpenVoteId(null)}
              onRequestOpenMissionDetail={handleNavigateToMissionDetail}
              debugSource={votesDebugSource}
            />
          </FeatureBoundary>
      )}

      <AnimatePresence>
        {role === "traveler" && isTravelerStateOpen && (
          <div className={isPickingCoordinate ? "invisible pointer-events-none" : undefined}>
            <FeatureBoundary
              resetKeys={[isTravelerStateOpen, token]}
              onClose={() => setIsTravelerStateOpen(false)}
              title="Traveler state hit a problem."
              message="Try again, or close state and reopen it."
              fallbackClassName={BOTTOM_SHEET_ERROR_CLASS}
            >
              <TravelerStateSheet
                token={token}
                onClose={() => {
                  music.sfx("close");
                  setIsTravelerStateOpen(false);
                }}
                onToast={showToast}
              />
            </FeatureBoundary>
          </div>
        )}
      </AnimatePresence>

      <div
        ref={cardsWrapperRef}
        className="absolute inset-x-3 top-3 z-[2] flex flex-col gap-2 tripcast-frame"
      >
        <FeatureBoundary
          resetKeys={[token, role, "hud-status-card"]}
          title="Status card hit a problem."
          message="Try again."
          fallbackClassName={CARD_ERROR_CLASS}
        >
          <StatusCardConnected
            token={token}
            role={role}
            onOpenState={() => {
              music.sfx("open");
              setActivityDebugSource({ source: "status-card:state", sourceLabel: "Status card" });
              setIsTravelerStateOpen(true);
            }}
          />
        </FeatureBoundary>
        <div className="flex items-center justify-between gap-2">
          {role === "traveler" ? (
            <LivePill on={isLocationSharing} onToggle={handleToggleLocationSharing} />
          ) : (
            <span aria-hidden="true" />
          )}
          <FeatureBoundary
            resetKeys={[token, role, "hud-funds-compact"]}
            title="Funds chip hit a problem."
            message="Try again."
            fallbackClassName={CARD_ERROR_CLASS}
          >
            <FundsCompactConnected
              token={token}
              role={role}
              onOpenSheet={role === "traveler" ? () => openFunds({ source: "funds-chip", sourceLabel: "Funds chip" }) : undefined}
            />
          </FeatureBoundary>
        </div>
      </div>

      <Sheet
        open={isTravelFundsSheetOpen}
        modal={false}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            music.sfx("close");
            setIsTravelFundsSheetOpen(false);
          }
        }}
      >
        <SheetContent
          side="bottom"
          showBackdrop={false}
          mapAdjacent
          className="z-[10] max-h-[78dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
          data-role="travel-funds-sheet"
        >
          <div aria-hidden="true" className="absolute left-0 right-0 top-0 h-1 rounded-t-xl" style={{ background: FUNDS_PERSONALITY.color }} />
          <div
            className="flex items-start justify-between gap-2 border-b border-[var(--line-soft)] px-4 pb-3 pt-2"
            style={{ background: `linear-gradient(180deg, ${FUNDS_PERSONALITY.bg} 0%, var(--bg-paper) 100%)` }}
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white shadow-sm"
                  style={{ background: FUNDS_PERSONALITY.color }}
                >
                  <DollarSign className="h-4 w-4" />
                </span>
                <SheetTitle className="font-[var(--font-display)] text-xl font-extrabold tracking-tight text-[var(--ink-1)]">
                  {TERMS.travelFunds}
                </SheetTitle>
              </div>
            </div>
            <SheetCloseButton aria-label={`Close ${TERMS.travelFunds.toLowerCase()}`} />
          </div>
          <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-4 pb-4 pt-3">
            {role === "traveler" && isTravelFundsSheetOpen && (
              <TravelFundsSheet
                token={token}
                onClose={() => {
                  music.sfx("close");
                  setIsTravelFundsSheetOpen(false);
                }}
                debugSource={fundsDebugSource}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <FeatureBoundary
        resetKeys={[isMissionsPanelOpen, token, role]}
        onClose={() => {
          music.sfx("close");
          setIsMissionsPanelOpen(false);
        }}
        title="Missions hit a problem."
        message="Try again, or close missions and reopen them."
        fallbackClassName={BOTTOM_SHEET_ERROR_CLASS}
      >
        <MissionPanel
          open={isMissionsPanelOpen}
          token={token}
          role={role}
          onClose={() => {
            music.sfx("close");
            setIsMissionsPanelOpen(false);
          }}
          onStartMission={() => {
            music.sfx("success");
            setIsMissionsPanelOpen(false);
          }}
          onRequestCoordinatePick={handleRequestMissionCoordinatePick}
          isPickingCoordinate={isPickingCoordinate}
          pendingOpenMissionId={pendingOpenMissionId}
          onClearPendingMission={() => setPendingOpenMissionId(null)}
          onRequestNavigateToMission={handleNavigateToMission}
          onCompleteAsStory={handleCompleteAsStory}
          pendingOpenDetailMissionId={pendingOpenDetailMissionId}
          prefilledCoordinate={missionPrefillCoordinate}
          onClearPrefill={() => setMissionPrefillCoordinate(null)}
          onClearPendingDetail={() => setPendingOpenDetailMissionId(null)}
          onRequestNavigateToVote={handleNavigateToVote}
          onOpenLinkedStory={handleOpenLinkedStory}
          debugSource={missionsDebugSource}
        />
      </FeatureBoundary>

      <FeatureBoundary
        resetKeys={[isJournalOpen, journalEvents.length]}
        onClose={() => {
          music.sfx("close");
          setIsJournalOpen(false);
        }}
        title="Journal hit a problem."
        message="Try again, or close journal and reopen it."
        fallbackClassName={BOTTOM_SHEET_ERROR_CLASS}
      >
            <JournalSheet
              open={isJournalOpen}
              events={journalEvents}
              token={token}
              role={role}
              onClose={() => {
                music.sfx("close");
                setIsJournalOpen(false);
              }}
              onStorySelect={(event) => {
                music.sfx("page");
                setIsJournalOpen(false);
                setStoryOpenedFromJournal(true);
                setStoryDebugSource({ source: "journal:story-select", sourceLabel: "Journal -> Story" });
                setSelectedStoryEvent(event);
              }}
              onLocationFocus={handleHistoryLocationFocus}
              onMarkAllRead={markAllRead}
              onRequestCoordinatePick={handleRequestStoryCoordinatePick}
              isPickingCoordinate={isPickingCoordinate}
              debugSource={journalDebugSource}
            />
      </FeatureBoundary>

      <StoryDetailSheet
        event={selectedStoryEvent}
        token={token}
        role={role}
        onClose={() => {
          music.sfx(storyOpenedFromJournal ? "page" : "close");
          const returnToJournal = storyOpenedFromJournal;
          setSelectedStoryEvent(null);
          setStoryOpenedFromJournal(false);
          if (returnToJournal) setIsJournalOpen(true);
        }}
        onLocationFocus={handleStoryDetailLocationFocus}
        missionTitle={
          selectedStoryEvent?.missionId
            ? (missionsForLookup ?? []).find((c) => c._id === selectedStoryEvent.missionId)?.title
            : undefined
        }
        missionId={selectedStoryEvent?.missionId ?? undefined}
        onNavigateToMission={handleOpenMissionFromStory}
        onRequestCoordinatePick={handleRequestStoryCoordinatePick}
        isPickingCoordinate={isPickingCoordinate}
        debugSource={storyDebugSource}
      />

      {role === "traveler" && (
        <FeatureBoundary
          resetKeys={[isSetActivityOpen, token]}
          onClose={() => {
            music.sfx("close");
            setIsSetActivityOpen(false);
          }}
          title="Activity editor hit a problem."
          message="Try again, or close the activity editor."
          fallbackClassName={BOTTOM_SHEET_ERROR_CLASS}
        >
          <SetActivitySheet
            open={isSetActivityOpen}
            token={token}
            debugSource={activityDebugSource}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) music.sfx("close");
              setIsSetActivityOpen(nextOpen);
            }}
          />
        </FeatureBoundary>
      )}
      </DesktopMapFrame>
    </section>
  );
}

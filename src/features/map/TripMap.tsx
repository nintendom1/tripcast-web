import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import maplibregl, { Marker } from "maplibre-gl";
import { AnimatePresence, motion } from "framer-motion";
import {
  tripcastApi,
  type AddCheckpointArgs,
  type Checkpoint,
  type HistoryEvent,
  type Role,
  type RouteVoteMapOverlay as RouteVoteMapOverlayType,
} from "../../convex/tripcastApi";
import AddCheckpointSheet, {
  type CheckpointPrefill,
  type SelectedCoordinate,
} from "./AddCheckpointSheet";
import RouteVoteMapOverlay from "./RouteVoteMapOverlay";
import ChallengeMarkers from "./ChallengeMarkers";
import ChallengePanel from "../challenges/ChallengePanel";
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
  SheetGrabber,
  SheetKicker,
  SheetTitle,
} from "../../components/ui/sheet";
import SetActivitySheet from "../currentactivity/SetActivitySheet";
import HistorySheet from "../history/HistorySheet";
import CheckInDetailSheet from "../history/CheckInDetailSheet";
import StoryDetailSheet from "../history/StoryDetailSheet";
import { useHistoryUnread } from "../history/useHistoryUnread";
import { FeatureBoundary } from "../../components/resilience/FeatureBoundary";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useTripAudioScenario } from "../../lib/audio/useTripAudioScenario";
import { useDebugLogger } from "../../debug/useDebugLogger";
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

const SEATTLE_CENTER: [number, number] = [-122.3321, 47.6062];
const OPEN_FREE_MAP_STYLE = "https://tiles.openfreemap.org/styles/bright";
const PANEL_ERROR_CLASS =
  "absolute bottom-5 left-5 z-[4] grid w-80 max-w-[calc(100%-40px)] gap-3 rounded-md border bg-background p-4 text-sm shadow-lg";
const BOTTOM_SHEET_ERROR_CLASS =
  "absolute inset-x-0 bottom-0 z-[4] grid gap-3 border-t bg-background p-4 text-sm shadow-lg";
const CARD_ERROR_CLASS =
  "grid w-56 gap-3 rounded-md border bg-background/95 p-3 text-xs shadow-md backdrop-blur-sm";

type CoordinatePickMode = {
  label: string;
  callback: (coord: { lat: number; lon: number }) => void;
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
    markersRef.current = checkpoints.map((checkpoint) => {
      const marker = new maplibregl.Marker({ color: "#d92332" })
        .setLngLat([checkpoint.lon, checkpoint.lat])
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
}) {
  const addCheckpoint = useMutation(tripcastApi.checkpoints.addCheckpoint);
  const completeChallengeAsStory = useMutation(tripcastApi.challenges.travelerCompleteChallengeAsStory);

  const [stateOpen, setStateOpen] = useState(false);
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
    if (prefill?.challengeId && prefill.completeChallenge !== false) {
      return completeChallengeAsStory({
        token,
        challengeId: prefill.challengeId,
        title: args.title,
        note: args.note,
        locationLabel: args.locationLabel,
        lat: args.lat,
        lon: args.lon,
        source: args.source,
        transaction: inlineTransaction,
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
};

export default function TripMap({
  token,
  role,
  locationResetNonce = 0,
  tripDataResetNonce = 0,
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
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedCheckInEvent, setSelectedCheckInEvent] = useState<HistoryEvent | null>(null);
  const [selectedStoryEvent, setSelectedStoryEvent] = useState<HistoryEvent | null>(null);
  const [checkInOpenedFromHistory, setCheckInOpenedFromHistory] = useState(false);
  const [storyOpenedFromHistory, setStoryOpenedFromHistory] = useState(false);
  const [isSetActivityOpen, setIsSetActivityOpen] = useState(false);
  const [isTravelFundsSheetOpen, setIsTravelFundsSheetOpen] = useState(false);
  const [isChallengesPanelOpen, setIsChallengesPanelOpen] = useState(false);
  const [pendingOpenChallengeId, setPendingOpenChallengeId] = useState<string | null>(null);
  // Mission Complete-as-Story flow: when the Traveler picks the "Complete as story"
  // branch in a mission detail, this prefill seeds AddCheckpointSheet with the
  // mission's title/location and carries the challengeId through so we can call
  // `travelerCompleteChallenge` after the resulting check-in lands.
  const [storyPrefill, setStoryPrefill] = useState<CheckpointPrefill | null>(null);
  // Set alongside `storyPrefill` so hitting "← Back" inside the story sheet
  // can reopen ChallengesPanel directly on the originating mission's detail
  // view (the four-button action set the Traveler expects to return to).
  const [pendingOpenDetailMissionId, setPendingOpenDetailMissionId] = useState<string | null>(null);
  const canWrite = role === "traveler";

  const updateTravelerLocation = useMutation(tripcastApi.travelerLocations.updateTravelerLocation);
  const stopTravelerLocationSharing = useMutation(
    tripcastApi.travelerLocations.stopTravelerLocationSharing,
  );
  const checkpoints = useQuery(tripcastApi.checkpoints.listCheckpoints, { token }) ?? [];
  const storedTravelerLocation = useQuery(tripcastApi.travelerLocations.getTravelerLocation, {
    token,
  });

  const historyEvents = useQuery(tripcastApi.historyEvents.listHistoryEvents, { token }) ?? [];
  const { unreadCount, markAllRead } = useHistoryUnread(historyEvents);

  const allChallengesForBadge = useQuery(
    tripcastApi.challenges.travelerListChallenges,
    role === "traveler" ? { token } : "skip",
  );
  const crewChallenges = useQuery(
    tripcastApi.challenges.supportCrewListChallenges,
    role === "support_crew" ? { token } : "skip",
  );
  const challengeBadgeCount =
    role === "traveler"
      ? (allChallengesForBadge ?? []).filter((c) => c.status === "proposed").length
      : 0;
  const challengesForLookup = role === "traveler" ? allChallengesForBadge : crewChallenges;

  const voteAlert = useQuery(tripcastApi.routeVotes.getActiveRouteVoteAlert, { token });
  const hasUnseenVote = voteAlert?.hasUnseen ?? false;

  const [fanOpen, setFanOpen] = useState(false);

  useTripAudioScenario({
    token,
    role,
    storyOpen: selectedStoryEvent !== null || storyPrefill !== null,
    voteActive: isVotePanelOpen || hasUnseenVote,
    challengeActive: isChallengesPanelOpen || isSetActivityOpen || challengeBadgeCount > 0,
  });

  useEffect(() => {
    musicRef.current = music;
  }, [music]);

  function openHistory() {
    if (isHistoryOpen) {
      log.logInteraction("panel:close", { panel: "history" });
      music.sfx("close");
      setIsHistoryOpen(false);
      return;
    }
    log.logInteraction("panel:open", { panel: "history" });
    performance.mark("tripcast:debug:history:open");
    music.sfx("open");
    setIsHistoryOpen(true);
    setIsChallengesPanelOpen(false);
    setIsVotePanelOpen(false);
    setIsTravelFundsSheetOpen(false);
  }
  function openChallenges() {
    if (isChallengesPanelOpen) {
      log.logInteraction("panel:close", { panel: "challenges" });
      music.sfx("close");
      setIsChallengesPanelOpen(false);
      return;
    }
    log.logInteraction("panel:open", { panel: "challenges" });
    performance.mark("tripcast:debug:challenges:open");
    music.sfx("open");
    setIsChallengesPanelOpen(true);
    setIsHistoryOpen(false);
    setIsVotePanelOpen(false);
    setIsTravelFundsSheetOpen(false);
  }
  function openVotes() {
    if (isVotePanelOpen) {
      log.logInteraction("panel:close", { panel: "votes" });
      music.sfx("close");
      setIsVotePanelOpen(false);
      return;
    }
    log.logInteraction("panel:open", { panel: "votes" });
    performance.mark("tripcast:debug:votes:open");
    music.sfx("open");
    setIsVotePanelOpen(true);
    setIsHistoryOpen(false);
    setIsChallengesPanelOpen(false);
    setIsTravelFundsSheetOpen(false);
  }
  function openFunds() {
    if (isTravelFundsSheetOpen) {
      log.logInteraction("panel:close", { panel: "funds" });
      music.sfx("close");
      setIsTravelFundsSheetOpen(false);
      return;
    }
    log.logInteraction("panel:open", { panel: "funds" });
    performance.mark("tripcast:debug:funds:open");
    music.sfx("open");
    setIsTravelFundsSheetOpen(true);
    setIsHistoryOpen(false);
    setIsChallengesPanelOpen(false);
    setIsVotePanelOpen(false);
  }

  const activeDockTab: DockTab | null = isHistoryOpen
    ? "history"
    : isChallengesPanelOpen
      ? "challenges"
      : isVotePanelOpen
        ? "votes"
        : isTravelFundsSheetOpen
          ? "funds"
          : null;

  function handleDockSelect(tab: DockTab) {
    setFanOpen(false);
    if (tab === "history") openHistory();
    else if (tab === "challenges") openChallenges();
    else if (tab === "votes") openVotes();
    else if (tab === "funds") openFunds();
  }

  function handleDockAdd() {
    if (role === "support_crew") {
      openChallenges();
      return;
    }
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
        setSelectedCoordinate(null);
        setIsPlacementMode(true);
        break;
      case "activity":
        music.sfx("open");
        setIsSetActivityOpen(true);
        break;
      case "transaction":
        openFunds();
        break;
      case "challenge":
        openChallenges();
        break;
      case "vote":
        openVotes();
        break;
    }
  }

  // Keep placement mode ref in sync
  useEffect(() => {
    placementModeRef.current = isPlacementMode;
  }, [isPlacementMode]);

  // ESC cancels coordinate pick mode
  useEffect(() => {
    console.log("[TripMap] coordinatePickMode state changed:", coordinatePickMode);
    if (!coordinatePickMode) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") cancelCoordinatePick();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  // cancelCoordinatePick is stable (no deps change it); adding coordinatePickMode as dep is sufficient

  }, [coordinatePickMode]);

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
      if (!canWrite) return;
      event.preventDefault();
      musicRef.current.sfx("pin");
      setSelectedCoordinate({
        lat: event.lngLat.lat,
        lon: event.lngLat.lng,
        source: "right_click",
      });
    });

    map.on("click", (event) => {
      // Coordinate pick mode takes priority
      if (coordinatePickModeRef.current) {
        console.log("[TripMap] Map clicked in coordinate pick mode at:", event.lngLat);
        const pick = coordinatePickModeRef.current;
        coordinatePickModeRef.current = null;
        setCoordinatePickMode(null);
        console.log("[TripMap] coordinatePickMode cleared, calling callback with:", {
          lat: event.lngLat.lat,
          lon: event.lngLat.lng,
        });
        musicRef.current.sfx("pin");
        pick.callback({ lat: event.lngLat.lat, lon: event.lngLat.lng });
        return;
      }

      if (!placementModeRef.current) return;
      log.logInteraction("coordinate:picked", { lat: event.lngLat.lat, lon: event.lngLat.lng, source: "placement" });
      setIsPlacementMode(false);
      musicRef.current.sfx("pin");
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
  // canWrite is stable after mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setIsHistoryOpen(false);
    setSelectedCheckInEvent(null);
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
    console.log("[TripMap] handleRequestCoordinatePick called, optionIndex:", optionIndex);
    music.sfx("page");
    const label = `Option ${optionIndex + 1} location`;
    coordinatePickModeRef.current = { label, callback };
    setCoordinatePickMode({ label, callback });
    console.log("[TripMap] coordinatePickMode set to:", { label, callback });
  }

  function handleNavigateToChallenge(coord: { lat: number; lon: number }) {
    if (!mapRef.current) return;
    // Offset the target so it appears in the visible area to the right of the
    // 320px panel and above the bottom detail sheet (~300px).
    mapRef.current.flyTo({
      center: [coord.lon, coord.lat],
      zoom: Math.max(mapRef.current.getZoom(), 14),
      padding: { top: 60, right: 60, bottom: 320, left: 380 },
    });
  }

  function handleRequestChallengeCoordinatePick(
    callback: (coord: { lat: number; lon: number }) => void,
  ) {
    music.sfx("page");
    const label = "the challenge location";
    coordinatePickModeRef.current = { label, callback };
    setCoordinatePickMode({ label, callback });
  }

  function cancelCoordinatePick() {
    coordinatePickModeRef.current = null;
    setCoordinatePickMode(null);
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
  // an explicit "complete this freeform activity as a check-in" flow can be
  // re-added in a later pass if the SetActivitySheet refresh wants it.

  function handleCompleteAsStory(challenge: {
    _id: string;
    status?: string;
    title?: string;
    description?: string;
    locationLabel?: string;
    lat?: number;
    lon?: number;
  }, transaction?: import("../../convex/tripcastApi").TransactionInlineInput) {
    music.sfx("page");
    setIsChallengesPanelOpen(false);
    setStoryPrefill({
      challengeId: challenge._id,
      completeChallenge: challenge.status === "in_progress",
      title: challenge.title,
      note: challenge.description,
      locationLabel: challenge.locationLabel,
      transaction,
      kickerLabel: "Story · Mission completion",
    });
    // Remember which mission to land on if the Traveler backs out of the story
    // form — the ChallengePanel re-opens directly on this detail view.
    setPendingOpenDetailMissionId(challenge._id);
    if (challenge.lat !== undefined && challenge.lon !== undefined) {
      setSelectedCoordinate({
        lat: challenge.lat,
        lon: challenge.lon,
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
    // panel; ChallengePanel reads `pendingOpenDetailMissionId` and lands on
    // the originating mission's detail view (the full four-button set).
    setStoryPrefill(null);
    setSelectedCoordinate(null);
    setIsPlacementMode(false);
    setIsChallengesPanelOpen(true);
  }

  function handleStoryCheckpointCreated(_id: string, prefill?: CheckpointPrefill) {
    setStoryPrefill(null);
    setPendingOpenDetailMissionId(null);
    if (prefill?.completeChallenge) {
      music.sfx("success");
      showToast("Mission completed.");
    } else if (prefill?.challengeId) {
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

    // Reset any persistent padding set by handleNavigateToChallenge before easing
    map.easeTo({
      center: [coordinate.lon, coordinate.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 700,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  }

  // Panel-aware focus: positions the pin in the visible map above the history sheet.
  // The history sheet is max-h-[50dvh], so apply matching bottom padding so the pin
  // lands in the vertical center of the exposed map area rather than behind the panel.
  function handleHistoryLocationFocus(coordinate: { lat: number; lon: number }) {
    const map = mapRef.current;
    if (!map) return;
    const mapHeight = map.getContainer().clientHeight;
    map.easeTo({
      center: [coordinate.lon, coordinate.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 700,
      padding: { top: 60, right: 60, bottom: Math.round(mapHeight * 0.55), left: 60 },
    });
  }

  function handleCheckInDetailLocationFocus(coordinate: { lat: number; lon: number }) {
    const map = mapRef.current;
    if (!map) return;
    const mapContainer = map.getContainer();
    const mapHeight = mapContainer.clientHeight;
    const mapWidth = mapContainer.clientWidth;
    const mapRect = mapContainer.getBoundingClientRect();
    const cardsRect = cardsWrapperRef.current?.getBoundingClientRect();
    const cardsRight = cardsRect ? Math.round(cardsRect.right) : 0;
    const cardsBottom = cardsRect ? cardsRect.bottom : 0;

    // Measure actual rendered sheet height; fall back to 50% of mapHeight if not mounted yet.
    const sheetEl = document.querySelector('[data-role="check-in-detail"]') as HTMLElement | null;
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
    if (lastCheckpoint) {
      centerMapOnCoordinate(lastCheckpoint);
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
  useEffect(() => {
    console.log("[TripMap] isPickingCoordinate computed value:", isPickingCoordinate);
  }, [isPickingCoordinate]);

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
      <div ref={mapContainerRef} className={mapClassName} />

      {/* Side-effect marker components */}
      <CheckpointMarkers
        map={mapInstance}
        checkpoints={checkpoints}
        onCheckpointClick={(checkpoint) => {
          if (isPlacementMode || coordinatePickMode) return;
          const event = historyEvents.find((e) => e.checkpointId === checkpoint._id);
          if (!event) return;
          if (event.storyLevel === "story") {
            music.sfx("page");
            setStoryOpenedFromHistory(false);
            setSelectedStoryEvent(event);
          } else {
            music.sfx("page");
            setCheckInOpenedFromHistory(false);
            setSelectedCheckInEvent(event);
          }
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
      <ChallengeMarkers
        map={mapInstance}
        token={token}
        role={role}
        onChallengeClick={(id) => {
          music.sfx("open");
          setIsChallengesPanelOpen(true);
          setPendingOpenChallengeId(id);
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

      {/* Music mute indicator — top-right of the map */}
      <MusicMuteIndicator className="absolute right-3 top-3 z-[2]" />

      {/* Map utility — center on traveler (replaces the LocateFixed FAB) */}
      <MapCenterButton
        className="absolute bottom-[88px] right-3 z-[2]"
        active={role === "traveler" ? isLocationSharing : storedTravelerLocation !== null}
        onClick={handleCenterLocation}
      />

      {/* Bottom Dock — replaces the bottom-left + bottom-right FAB clusters */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[3] tripcast-frame">
        <Dock
          active={activeDockTab}
          onSelect={handleDockSelect}
          onAdd={handleDockAdd}
          fanOpen={fanOpen}
          addLabel={role === "traveler" ? "Add" : "Propose mission"}
          showFunds={role === "traveler"}
          badges={{
            history: unreadCount,
            challenges: challengeBadgeCount,
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
          onBack={storyPrefill?.challengeId ? handleBackFromStory : undefined}
        />
      )}

      {/* Vote panels — hidden (not unmounted) during coordinate pick to preserve form state */}
      <AnimatePresence>
        {role === "support_crew" && isVotePanelOpen && (
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
              key="crew-vote-panel"
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
            />
          </FeatureBoundary>
        )}
      </AnimatePresence>

      {role === "traveler" && isVotePanelOpen && (
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
              onOpenSheet={role === "traveler" ? openFunds : undefined}
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
          className="z-[10] max-h-[78dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
          data-role="travel-funds-sheet"
        >
          <SheetGrabber />
          <div className="flex items-start justify-between gap-2 px-4 pt-2">
            <div className="flex min-w-0 flex-col gap-1">
              <SheetKicker dotColor="var(--green)">Wallet</SheetKicker>
              <SheetTitle className="font-[var(--font-display)] text-xl font-extrabold tracking-tight text-[var(--ink-1)]">
                Travel funds
              </SheetTitle>
            </div>
            <SheetCloseButton aria-label="Close travel funds" />
          </div>
          <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-4 pb-4 pt-3">
            {role === "traveler" && isTravelFundsSheetOpen && (
              <TravelFundsSheet
                token={token}
                onClose={() => {
                  music.sfx("close");
                  setIsTravelFundsSheetOpen(false);
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <FeatureBoundary
        resetKeys={[isChallengesPanelOpen, token, role]}
        onClose={() => {
          music.sfx("close");
          setIsChallengesPanelOpen(false);
        }}
        title="Challenges hit a problem."
        message="Try again, or close challenges and reopen them."
        fallbackClassName={BOTTOM_SHEET_ERROR_CLASS}
      >
        <ChallengePanel
          open={isChallengesPanelOpen}
          token={token}
          role={role}
          onClose={() => {
            music.sfx("close");
            setIsChallengesPanelOpen(false);
          }}
          onStartChallenge={() => {
            music.sfx("success");
            setIsChallengesPanelOpen(false);
          }}
          onRequestCoordinatePick={handleRequestChallengeCoordinatePick}
          isPickingCoordinate={isPickingCoordinate}
          pendingOpenChallengeId={pendingOpenChallengeId}
          onClearPendingChallenge={() => setPendingOpenChallengeId(null)}
          onRequestNavigateToChallenge={handleNavigateToChallenge}
          onCompleteAsStory={handleCompleteAsStory}
          pendingOpenDetailChallengeId={pendingOpenDetailMissionId}
          onClearPendingDetail={() => setPendingOpenDetailMissionId(null)}
        />
      </FeatureBoundary>

      <AnimatePresence>
        {isHistoryOpen && (
          <FeatureBoundary
            resetKeys={[isHistoryOpen, historyEvents.length]}
            onClose={() => {
              music.sfx("close");
              setIsHistoryOpen(false);
            }}
            title="History hit a problem."
            message="Try again, or close history and reopen it."
            fallbackClassName={BOTTOM_SHEET_ERROR_CLASS}
          >
            <HistorySheet
              events={historyEvents}
              token={token}
              role={role}
              onClose={() => {
                music.sfx("close");
                setIsHistoryOpen(false);
              }}
              onCheckInSelect={(event) => {
                music.sfx("page");
                setIsHistoryOpen(false);
                setCheckInOpenedFromHistory(true);
                setSelectedCheckInEvent(event);
              }}
              onStorySelect={(event) => {
                music.sfx("page");
                setIsHistoryOpen(false);
                setStoryOpenedFromHistory(true);
                setSelectedStoryEvent(event);
              }}
              onLocationFocus={handleHistoryLocationFocus}
              onMarkAllRead={markAllRead}
            />
          </FeatureBoundary>
        )}
      </AnimatePresence>

      <CheckInDetailSheet
        event={selectedCheckInEvent}
        onClose={() => {
          music.sfx(checkInOpenedFromHistory ? "page" : "close");
          const returnToHistory = checkInOpenedFromHistory;
          setSelectedCheckInEvent(null);
          setCheckInOpenedFromHistory(false);
          if (returnToHistory) setIsHistoryOpen(true);
        }}
        onLocationFocus={handleCheckInDetailLocationFocus}
      />

      <StoryDetailSheet
        event={selectedStoryEvent}
        onClose={() => {
          music.sfx(storyOpenedFromHistory ? "page" : "close");
          const returnToHistory = storyOpenedFromHistory;
          setSelectedStoryEvent(null);
          setStoryOpenedFromHistory(false);
          if (returnToHistory) setIsHistoryOpen(true);
        }}
        onLocationFocus={handleCheckInDetailLocationFocus}
        missionTitle={
          selectedStoryEvent?.challengeId
            ? (challengesForLookup ?? []).find((c) => c._id === selectedStoryEvent.challengeId)?.title
            : undefined
        }
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
            onOpenChange={(nextOpen) => {
              if (!nextOpen) music.sfx("close");
              setIsSetActivityOpen(nextOpen);
            }}
          />
        </FeatureBoundary>
      )}
    </section>
  );
}

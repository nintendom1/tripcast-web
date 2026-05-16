import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import maplibregl, { Marker } from "maplibre-gl";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Clock, LocateFixed, MapPin, Navigation, Trophy, Vote } from "lucide-react";

import {
  tripcastApi,
  type AddCheckpointArgs,
  type Checkpoint,
  type HistoryEvent,
  type Role,
  type RouteVoteMapOverlay as RouteVoteMapOverlayType,
} from "../../convex/tripcastApi";
import AddCheckpointSheet, { type SelectedCoordinate } from "./AddCheckpointSheet";
import RouteVoteMapOverlay from "./RouteVoteMapOverlay";
import ChallengeMarkers from "./ChallengeMarkers";
import ChallengePanel from "../challenges/ChallengePanel";
import RouteVoteButton from "../routevote/RouteVoteButton";
import RouteVotePanel from "../routevote/RouteVotePanel";
import RouteVoteProgress from "../routevote/RouteVoteProgress";
import TravelerStateSheet from "../travelstate/TravelerStateSheet";
import TravelerStateCard from "../travelstate/TravelerStateCard";
import CurrentActivityCard from "../currentactivity/CurrentActivityCard";
import type { CurrentActivity } from "../../convex/tripcastApi";
import SetActivitySheet from "../currentactivity/SetActivitySheet";
import HistoryPanel from "../history/HistoryPanel";
import CheckInDetailSheet from "../history/CheckInDetailSheet";
import { useHistoryUnread } from "../history/useHistoryUnread";
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

type CoordinatePickMode = {
  label: string;
  callback: (coord: { lat: number; lon: number }) => void;
};

function isFiniteLngLatBounds(
  bounds: [[number, number], [number, number]],
) {
  return bounds.every(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
}

function BadgeSpan({ count }: { count: number }) {
  return (
    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-crimson text-[10px] font-bold text-white pointer-events-none">
      {count > 9 ? "9+" : count}
    </span>
  );
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  onCheckpointCreated,
}: {
  selectedCoordinate: SelectedCoordinate | null;
  token: string;
  onClose: () => void;
  prefill?: { title?: string; note?: string; locationLabel?: string };
  onCheckpointCreated?: (id: string) => void;
}) {
  const addCheckpoint = useMutation(tripcastApi.checkpoints.addCheckpoint);

  const [stateOpen, setStateOpen] = useState(false);
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
    }
  }, [selectedCoordinate]);

  async function handleSave(args: Omit<AddCheckpointArgs, "token">): Promise<string> {
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
  const [checkInOpenedFromHistory, setCheckInOpenedFromHistory] = useState(false);
  const [isSetActivityOpen, setIsSetActivityOpen] = useState(false);
  const [activityToComplete, setActivityToComplete] = useState<CurrentActivity | null>(null);
  const [isChallengesPanelOpen, setIsChallengesPanelOpen] = useState(false);
  const [pendingOpenChallengeId, setPendingOpenChallengeId] = useState<string | null>(null);

  const canWrite = role === "traveler";

  const updateTravelerLocation = useMutation(tripcastApi.travelerLocations.updateTravelerLocation);
  const stopTravelerLocationSharing = useMutation(
    tripcastApi.travelerLocations.stopTravelerLocationSharing,
  );
  const completeCurrentActivity = useMutation(tripcastApi.currentActivity.travelerCompleteCurrentActivity);
  const checkpoints = useQuery(tripcastApi.checkpoints.listCheckpoints, { token }) ?? [];
  const storedTravelerLocation = useQuery(tripcastApi.travelerLocations.getTravelerLocation, {
    token,
  });

  const travelerVotes = useQuery(
    tripcastApi.routeVotes.travelerListRouteVotes,
    role === "traveler" ? { token } : "skip",
  ) ?? [];

  const historyEvents = useQuery(tripcastApi.historyEvents.listHistoryEvents, { token }) ?? [];
  const { unreadCount, markAllRead } = useHistoryUnread(historyEvents);

  const allChallengesForBadge = useQuery(
    tripcastApi.challenges.travelerListChallenges,
    role === "traveler" ? { token } : "skip",
  );
  const challengeBadgeCount =
    role === "traveler"
      ? (allChallengesForBadge ?? []).filter((c) => c.status === "proposed").length
      : 0;

  function openHistory() {
    if (isHistoryOpen) { setIsHistoryOpen(false); return; }
    setIsHistoryOpen(true);
    setIsChallengesPanelOpen(false);
    setIsVotePanelOpen(false);
  }
  function openChallenges() {
    if (isChallengesPanelOpen) { setIsChallengesPanelOpen(false); return; }
    setIsChallengesPanelOpen(true);
    setIsHistoryOpen(false);
    setIsVotePanelOpen(false);
  }
  function openVotes() {
    if (isVotePanelOpen) { setIsVotePanelOpen(false); return; }
    setIsVotePanelOpen(true);
    setIsHistoryOpen(false);
    setIsChallengesPanelOpen(false);
  }

  // Keep placement mode ref in sync
  useEffect(() => {
    placementModeRef.current = isPlacementMode;
  }, [isPlacementMode]);

  // ESC cancels coordinate pick mode
  useEffect(() => {
    if (!coordinatePickMode) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") cancelCoordinatePick();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  // cancelCoordinatePick is stable (no deps change it); adding coordinatePickMode as dep is sufficient
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setSelectedCoordinate({
        lat: event.lngLat.lat,
        lon: event.lngLat.lng,
        source: "right_click",
      });
    });

    map.on("click", (event) => {
      // Coordinate pick mode takes priority
      if (coordinatePickModeRef.current) {
        const pick = coordinatePickModeRef.current;
        coordinatePickModeRef.current = null;
        setCoordinatePickMode(null);
        pick.callback({ lat: event.lngLat.lat, lon: event.lngLat.lng });
        return;
      }

      if (!placementModeRef.current) return;
      setIsPlacementMode(false);
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
    setActivityToComplete(null);
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
    const label = `Option ${optionIndex + 1} location`;
    coordinatePickModeRef.current = { label, callback };
    setCoordinatePickMode({ label, callback });
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

  function handleCompleteAsCheckIn(activity: CurrentActivity) {
    if (activity.lat !== undefined && activity.lon !== undefined) {
      setSelectedCoordinate({ lat: activity.lat, lon: activity.lon, source: "current_activity" });
    } else {
      setIsPlacementMode(true);
    }
    setActivityToComplete(activity);
  }

  async function handleCheckpointCreated(checkpointId: string) {
    if (!activityToComplete) return;
    try {
      await completeCurrentActivity({
        token,
        activityId: activityToComplete._id,
        checkpointId,
      });
    } catch {
      // Non-fatal: the checkpoint was saved; activity completion is best-effort
    }
    setActivityToComplete(null);
  }

  function showToast(message: string) {
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
    map.easeTo({
      center: [coordinate.lon, coordinate.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 700,
      padding: { top: 60, right: 60, bottom: Math.round(window.innerHeight * 0.55), left: 60 },
    });
  }

  // CheckInDetailSheet is max-h-[50dvh]; use 60dvh bottom padding so the pin
  // appears clearly above the sheet. Left padding is measured from the cards
  // wrapper's actual rendered right edge so the pin lands to the right of the
  // cards on narrow screens (iPhone) and in open map space on wide screens.
  function handleCheckInDetailLocationFocus(coordinate: { lat: number; lon: number }) {
    const map = mapRef.current;
    if (!map) return;
    const cardsRect = cardsWrapperRef.current?.getBoundingClientRect();
    const leftPadding = cardsRect ? Math.round(cardsRect.right) + 16 : 60;
    map.easeTo({
      center: [coordinate.lon, coordinate.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 700,
      padding: { top: 60, right: 60, bottom: Math.round(window.innerHeight * 0.60), left: leftPadding },
    });
  }

  function handleCenterLocation() {
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
          if (event) {
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
              onClick={() => setIsPlacementMode(false)}
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
            className={`absolute left-1/2 z-[6] -translate-x-1/2 rounded-md bg-navy px-4 py-2 text-sm font-medium text-white shadow-lg max-w-[calc(100%-24px)] ${
              role === "traveler" ? "bottom-[230px]" : "bottom-[180px]"
            }`}
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Panel-navigation cluster — icon-only vertical column, bottom-left */}
      <div className="absolute bottom-5 left-5 z-[2] flex flex-col gap-2">
        <button
          type="button"
          aria-label={isHistoryOpen ? "Close history" : "History"}
          onClick={openHistory}
          className="relative w-11 h-11 flex items-center justify-center bg-white border border-slate-300 rounded-md shadow-lg text-navy hover:bg-slate-50 transition-colors"
        >
          <Clock className="h-5 w-5" aria-hidden="true" />
          {unreadCount > 0 && <BadgeSpan count={unreadCount} />}
        </button>

        {(role === "traveler" || role === "support_crew") && (
          <button
            type="button"
            aria-label={isChallengesPanelOpen ? "Close challenges" : "Challenges"}
            onClick={openChallenges}
            className={`relative w-11 h-11 flex items-center justify-center border rounded-md shadow-lg transition-colors ${
              isChallengesPanelOpen
                ? "bg-navy text-white border-navy hover:bg-navy/90"
                : "bg-white text-navy border-slate-300 hover:bg-slate-50"
            }`}
          >
            <Trophy className="h-5 w-5" aria-hidden="true" />
            {challengeBadgeCount > 0 && <BadgeSpan count={challengeBadgeCount} />}
          </button>
        )}

        {role === "traveler" && (
          <button
            type="button"
            aria-label={isTravelerStateOpen ? "Close state" : "Traveler state"}
            onClick={() => setIsTravelerStateOpen((p) => !p)}
            className="w-11 h-11 flex items-center justify-center bg-white border border-slate-300 rounded-md shadow-lg text-navy hover:bg-slate-50 transition-colors"
          >
            <Activity className="h-5 w-5" aria-hidden="true" />
          </button>
        )}

        {role === "traveler" && (
          <button
            type="button"
            aria-label={isVotePanelOpen ? "Close votes" : "Route votes"}
            onClick={openVotes}
            className="w-11 h-11 flex items-center justify-center bg-white border border-slate-300 rounded-md shadow-lg text-navy hover:bg-slate-50 transition-colors"
          >
            <Vote className="h-5 w-5" aria-hidden="true" />
          </button>
        )}

        {role === "support_crew" && (
          <RouteVoteButton token={token} onClick={openVotes} />
        )}
      </div>

      {/* Map-utilities cluster — icon-only vertical column, bottom-right */}
      <div className="absolute bottom-5 right-5 z-[2] flex flex-col-reverse gap-2">
        <button
          type="button"
          aria-label="Center map on traveler location"
          onClick={handleCenterLocation}
          className="w-11 h-11 flex items-center justify-center bg-white border border-slate-300 rounded-md shadow-lg text-navy hover:bg-slate-50 transition-colors"
        >
          <LocateFixed className="h-5 w-5" aria-hidden="true" />
        </button>

        {role === "traveler" && (
          <button
            type="button"
            aria-label={isLocationSharing ? "Stop sharing location" : "Share location"}
            onClick={handleToggleLocationSharing}
            className={`w-11 h-11 flex items-center justify-center border rounded-md shadow-lg transition-colors ${
              isLocationSharing
                ? "bg-navy text-white border-navy hover:bg-navy/90"
                : "bg-white text-navy border-slate-300 hover:bg-slate-50"
            }`}
          >
            <Navigation className="h-5 w-5" aria-hidden="true" />
          </button>
        )}

        {canWrite && (
          <button
            type="button"
            aria-label="Add pin"
            onClick={() => {
              setSelectedCoordinate(null);
              setIsPlacementMode(true);
            }}
            className="w-11 h-11 flex items-center justify-center bg-white border border-slate-300 rounded-md shadow-lg text-navy hover:bg-slate-50 transition-colors"
          >
            <MapPin className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Checkpoint add sheet */}
      {canWrite && (
        <ConvexCheckpointSheet
          selectedCoordinate={selectedCoordinate}
          token={token}
          onClose={() => {
            setSelectedCoordinate(null);
            setActivityToComplete(null);
          }}
          prefill={activityToComplete ? {
            title: activityToComplete.title,
            note: activityToComplete.note,
            locationLabel: activityToComplete.locationLabel,
          } : undefined}
          onCheckpointCreated={handleCheckpointCreated}
        />
      )}

      {/* Vote panels — hidden (not unmounted) during coordinate pick to preserve form state */}
      <AnimatePresence>
        {role === "support_crew" && isVotePanelOpen && (
          <RouteVotePanel
            key="crew-vote-panel"
            token={token}
            onClose={() => {
              setIsVotePanelOpen(false);
              setVoteMapOverlay(null);
              setVoteOptionNumberById(null);
            }}
            onVoteOverlayChange={handleVoteOverlayChange}
            onRequestFitMap={handleRequestFitMap}
            fallbackOrigin={routeVoteFallbackOrigin}
          />
        )}
      </AnimatePresence>

      {role === "traveler" && isVotePanelOpen && (
        <div className={isPickingCoordinate ? "invisible pointer-events-none" : undefined}>
          <RouteVoteProgress
            token={token}
            onClose={() => {
              setIsVotePanelOpen(false);
              setVoteMapOverlay(null);
              setVoteOptionNumberById(null);
            }}
            onRequestCoordinatePick={handleRequestCoordinatePick}
            referenceLocation={livePosition}
            onVoteOverlayChange={handleVoteOverlayChange}
            onRequestFitMap={handleRequestFitMap}
            fallbackOrigin={routeVoteFallbackOrigin}
          />
        </div>
      )}

      <AnimatePresence>
        {role === "traveler" && isTravelerStateOpen && (
          <div className={isPickingCoordinate ? "invisible pointer-events-none" : undefined}>
            <TravelerStateSheet
              token={token}
              onClose={() => setIsTravelerStateOpen(false)}
              onToast={showToast}
            />
          </div>
        )}
      </AnimatePresence>

      <div ref={cardsWrapperRef} className="absolute top-5 left-5 z-[2] flex flex-col gap-2">
        <TravelerStateCard token={token} role={role} />
        <CurrentActivityCard
          token={token}
          role={role}
          onCompleteAsCheckIn={handleCompleteAsCheckIn}
          onRequestSetActivity={() => setIsSetActivityOpen(true)}
        />
      </div>

      <ChallengePanel
        open={isChallengesPanelOpen}
        token={token}
        role={role}
        onClose={() => setIsChallengesPanelOpen(false)}
        onStartChallenge={() => setIsChallengesPanelOpen(false)}
        onRequestCoordinatePick={handleRequestChallengeCoordinatePick}
        isPickingCoordinate={isPickingCoordinate}
        pendingOpenChallengeId={pendingOpenChallengeId}
        onClearPendingChallenge={() => setPendingOpenChallengeId(null)}
        onRequestNavigateToChallenge={handleNavigateToChallenge}
      />

      <AnimatePresence>
        {isHistoryOpen && (
          <HistoryPanel
            events={historyEvents}
            onClose={() => setIsHistoryOpen(false)}
            onCheckInSelect={(event) => {
              setIsHistoryOpen(false);
              setCheckInOpenedFromHistory(true);
              setSelectedCheckInEvent(event);
            }}
            onLocationFocus={handleHistoryLocationFocus}
            onMarkAllRead={markAllRead}
          />
        )}
      </AnimatePresence>

      <CheckInDetailSheet
        event={selectedCheckInEvent}
        onClose={() => {
          const returnToHistory = checkInOpenedFromHistory;
          setSelectedCheckInEvent(null);
          setCheckInOpenedFromHistory(false);
          if (returnToHistory) setIsHistoryOpen(true);
        }}
        onLocationFocus={centerMapOnCoordinate}
      />

      {role === "traveler" && (
        <SetActivitySheet
          open={isSetActivityOpen}
          token={token}
          onOpenChange={setIsSetActivityOpen}
        />
      )}
    </section>
  );
}

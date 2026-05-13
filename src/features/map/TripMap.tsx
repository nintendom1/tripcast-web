import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import maplibregl, { Marker } from "maplibre-gl";
import { AnimatePresence, motion } from "framer-motion";
import { LocateFixed } from "lucide-react";

import {
  tripcastApi,
  type AddCheckpointArgs,
  type Checkpoint,
  type Role,
  type RouteVoteMapOverlay as RouteVoteMapOverlayType,
} from "../../convex/tripcastApi";
import AddCheckpointSheet, { type SelectedCoordinate } from "./AddCheckpointSheet";
import RouteVoteMapOverlay from "./RouteVoteMapOverlay";
import ChallengeMarkers from "./ChallengeMarkers";
import RouteVoteButton from "../routevote/RouteVoteButton";
import RouteVotePanel from "../routevote/RouteVotePanel";
import RouteVoteProgress from "../routevote/RouteVoteProgress";

const SEATTLE_CENTER: [number, number] = [-122.3321, 47.6062];
const OPEN_FREE_MAP_STYLE = "https://tiles.openfreemap.org/styles/bright";

type CoordinatePickMode = {
  optionIndex: number;
  callback: (coord: { lat: number; lon: number }) => void;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function createPopupContent(checkpoint: Checkpoint) {
  const wrapper = document.createElement("div");
  wrapper.className = "checkpoint-popup";

  const title = document.createElement("strong");
  title.textContent = checkpoint.title;
  wrapper.appendChild(title);

  if (checkpoint.note) {
    const note = document.createElement("p");
    note.textContent = checkpoint.note;
    wrapper.appendChild(note);
  }

  const coords = document.createElement("small");
  coords.textContent = `${checkpoint.lat.toFixed(5)}, ${checkpoint.lon.toFixed(5)}`;
  wrapper.appendChild(coords);

  return wrapper;
}

function CheckpointMarkers({
  map,
  checkpoints,
}: {
  map: maplibregl.Map | null;
  checkpoints: Checkpoint[];
}) {
  const markersRef = useRef<Marker[]>([]);

  useEffect(() => {
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = checkpoints.map((checkpoint) => {
      const popup = new maplibregl.Popup({ offset: 20 }).setDOMContent(
        createPopupContent(checkpoint),
      );
      return new maplibregl.Marker({ color: "#d92332" })
        .setLngLat([checkpoint.lon, checkpoint.lat])
        .setPopup(popup)
        .addTo(map);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
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
}: {
  selectedCoordinate: SelectedCoordinate | null;
  token: string;
  onClose: () => void;
}) {
  const addCheckpoint = useMutation(tripcastApi.checkpoints.addCheckpoint);

  async function handleSave(args: Omit<AddCheckpointArgs, "token">) {
    await addCheckpoint({ ...args, token });
  }

  return (
    <AddCheckpointSheet
      selectedCoordinate={selectedCoordinate}
      onClose={onClose}
      onSave={handleSave}
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

  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [selectedCoordinate, setSelectedCoordinate] = useState<SelectedCoordinate | null>(null);
  const [isPlacementMode, setIsPlacementMode] = useState(false);
  const [isVotePanelOpen, setIsVotePanelOpen] = useState(false);
  const [voteMapOverlay, setVoteMapOverlay] = useState<RouteVoteMapOverlayType | null>(null);
  const [voteOptionNumberById, setVoteOptionNumberById] = useState<Record<string, number> | null>(null);
  const [isLocationSharing, setIsLocationSharing] = useState(false);
  const [livePosition, setLivePosition] = useState<{ lat: number; lon: number } | null>(null);
  const [coordinatePickMode, setCoordinatePickMode] = useState<CoordinatePickMode | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const canWrite = role === "traveler";

  const updateTravelerLocation = useMutation(tripcastApi.travelerLocations.updateTravelerLocation);
  const stopTravelerLocationSharing = useMutation(
    tripcastApi.travelerLocations.stopTravelerLocationSharing,
  );
  const checkpoints = useQuery(tripcastApi.checkpoints.listCheckpoints, { token }) ?? [];
  const storedTravelerLocation = useQuery(tripcastApi.travelerLocations.getTravelerLocation, {
    token,
  });

  const travelerVotes = useQuery(
    tripcastApi.routeVotes.travelerListRouteVotes,
    role === "traveler" ? { token } : "skip",
  ) ?? [];

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
    coordinatePickModeRef.current = { optionIndex, callback };
    setCoordinatePickMode({ optionIndex, callback });
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

    map.easeTo({
      center: [coordinate.lon, coordinate.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 700,
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
  const routeVoteFallbackOrigin =
    role === "traveler" && livePosition
      ? livePosition
      : latestCheckpoint
        ? { lat: latestCheckpoint.lat, lon: latestCheckpoint.lon }
        : null;

  return (
    <section className="relative min-h-0 flex-1" aria-label="Checkpoint map">
      <div ref={mapContainerRef} className={mapClassName} />

      {/* Side-effect marker components */}
      <CheckpointMarkers map={mapInstance} checkpoints={checkpoints} />
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
        map={mapInstance}
        overlay={isVotePanelOpen ? voteMapOverlay : null}
        fallbackOrigin={routeVoteFallbackOrigin}
        optionNumberById={voteOptionNumberById}
      />
      {role === "traveler" && (
        <ChallengeMarkers map={mapInstance} votes={travelerVotes} />
      )}

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
              Tap the map to set Option {coordinatePickMode.optionIndex + 1} location.
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
              role === "traveler" ? "bottom-[176px]" : "bottom-[128px]"
            }`}
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        className={`absolute right-5 z-[2] flex items-center justify-center gap-2 min-h-11 px-4 bg-white border border-slate-300 rounded-md shadow-lg text-navy font-bold text-sm hover:bg-slate-50 transition-colors ${
          role === "traveler" ? "bottom-[120px]" : "bottom-5"
        }`}
        onClick={handleCenterLocation}
        aria-label="Center map on traveler location"
      >
        <LocateFixed className="h-4 w-4" aria-hidden="true" />
      </button>

      {/* Traveler action buttons */}
      {canWrite && (
        <button
          className="absolute bottom-5 right-5 z-[2] flex items-center justify-center min-h-11 px-4 bg-white border border-slate-300 rounded-md shadow-lg text-navy font-bold text-sm hover:bg-slate-50 transition-colors"
          type="button"
          onClick={() => {
            setSelectedCoordinate(null);
            setIsPlacementMode(true);
          }}
        >
          Add Pin
        </button>
      )}

      {role === "traveler" && (
        <button
          type="button"
          className={`absolute bottom-[70px] right-5 z-[2] flex items-center justify-center min-h-11 px-4 border rounded-md shadow-lg font-bold text-sm transition-colors ${
            isLocationSharing
              ? "bg-navy text-white border-navy hover:bg-navy/90"
              : "bg-white text-navy border-slate-300 hover:bg-slate-50"
          }`}
          onClick={handleToggleLocationSharing}
        >
          {isLocationSharing ? "Stop Sharing" : "Share Location"}
        </button>
      )}

      {role === "traveler" && (
        <button
          type="button"
          className="absolute bottom-[70px] left-5 z-[2] flex items-center justify-center min-h-11 px-4 bg-white border border-slate-300 rounded-md shadow-lg text-navy font-bold text-sm hover:bg-slate-50 transition-colors"
          onClick={() => setIsVotePanelOpen((p) => !p)}
        >
          {isVotePanelOpen ? "Close Votes" : "Manage Votes"}
        </button>
      )}

      {role === "support_crew" && (
        <RouteVoteButton token={token} onClick={() => setIsVotePanelOpen(true)} />
      )}

      {/* Checkpoint add sheet */}
      {canWrite && (
        <ConvexCheckpointSheet
          selectedCoordinate={selectedCoordinate}
          token={token}
          onClose={() => setSelectedCoordinate(null)}
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
    </section>
  );
}

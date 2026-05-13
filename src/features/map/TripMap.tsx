import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import maplibregl, { Marker } from "maplibre-gl";
import { AnimatePresence, motion } from "framer-motion";

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

function CheckpointMarkers({ map, token }: { map: maplibregl.Map | null; token: string }) {
  const markersRef = useRef<Marker[]>([]);
  const checkpoints = useQuery(tripcastApi.checkpoints.listCheckpoints, { token }) ?? [];

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
}: {
  map: maplibregl.Map | null;
  position: { lat: number; lon: number } | null;
}) {
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!position) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (markerRef.current) {
      markerRef.current.setLngLat([position.lon, position.lat]);
    } else {
      const el = document.createElement("div");
      el.className = "traveler-location-marker";

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
  }, [map, position]);

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
};

export default function TripMap({ token, role }: TripMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const placementModeRef = useRef(false);
  const locationWatchRef = useRef<number | null>(null);
  const lastSentLocationRef = useRef<LastSentLocation>(null);
  const coordinatePickModeRef = useRef<CoordinatePickMode | null>(null);

  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [selectedCoordinate, setSelectedCoordinate] = useState<SelectedCoordinate | null>(null);
  const [isPlacementMode, setIsPlacementMode] = useState(false);
  const [isVotePanelOpen, setIsVotePanelOpen] = useState(false);
  const [voteMapOverlay, setVoteMapOverlay] = useState<RouteVoteMapOverlayType | null>(null);
  const [isLocationSharing, setIsLocationSharing] = useState(false);
  const [livePosition, setLivePosition] = useState<{ lat: number; lon: number } | null>(null);
  const [coordinatePickMode, setCoordinatePickMode] = useState<CoordinatePickMode | null>(null);

  const canWrite = role === "traveler";

  const updateTravelerLocation = useMutation(tripcastApi.travelerLocations.updateTravelerLocation);

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

  // Cleanup geolocation watch on unmount
  useEffect(() => {
    return () => {
      if (locationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
      }
    };
  }, []);

  function handleToggleLocationSharing() {
    if (isLocationSharing) {
      if (locationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
        locationWatchRef.current = null;
      }
      lastSentLocationRef.current = null;
      setLivePosition(null);
      setIsLocationSharing(false);
    } else {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude: lat, longitude: lon, accuracy } = pos.coords;
          setLivePosition({ lat, lon });

          const last = lastSentLocationRef.current;
          const now = Date.now();
          const moved =
            !last ||
            Math.abs(lat - last.lat) > 0.0001 ||
            Math.abs(lon - last.lon) > 0.0001 ||
            now - last.sentAt > 30_000;
          if (!moved) return;

          lastSentLocationRef.current = { lat, lon, sentAt: now };
          updateTravelerLocation({ token, lat, lon, accuracy: accuracy ?? undefined }).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: true },
      );
      locationWatchRef.current = watchId;
      setIsLocationSharing(true);
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

  function handleVoteOverlayChange(overlay: RouteVoteMapOverlayType | null) {
    setVoteMapOverlay(overlay);
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

  return (
    <section className="relative min-h-0 flex-1" aria-label="Checkpoint map">
      <div ref={mapContainerRef} className={mapClassName} />

      {/* Side-effect marker components */}
      <CheckpointMarkers map={mapInstance} token={token} />
      <TravelerLocationMarker
        map={mapInstance}
        position={
          role === "traveler"
            ? livePosition
            : (isVotePanelOpen ? (voteMapOverlay?.travelerLocation ?? null) : null)
        }
      />
      <RouteVoteMapOverlay
        map={mapInstance}
        overlay={isVotePanelOpen ? voteMapOverlay : null}
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
            }}
            onVoteOverlayChange={handleVoteOverlayChange}
            onRequestFitMap={handleRequestFitMap}
          />
        )}
      </AnimatePresence>

      {role === "traveler" && isVotePanelOpen && (
        <div className={isPickingCoordinate ? "invisible pointer-events-none" : undefined}>
          <RouteVoteProgress
            token={token}
            onClose={() => setIsVotePanelOpen(false)}
            onRequestCoordinatePick={handleRequestCoordinatePick}
            referenceLocation={livePosition}
          />
        </div>
      )}
    </section>
  );
}

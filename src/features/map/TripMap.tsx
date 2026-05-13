import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import maplibregl, { Marker } from "maplibre-gl";
import { AnimatePresence, motion } from "framer-motion";

import { tripcastApi, type AddCheckpointArgs, type Checkpoint, type Role } from "../../convex/tripcastApi";
import AddCheckpointSheet, { type SelectedCoordinate } from "./AddCheckpointSheet";

const SEATTLE_CENTER: [number, number] = [-122.3321, 47.6062];
const OPEN_FREE_MAP_STYLE = "https://tiles.openfreemap.org/styles/bright";

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

type TripMapProps = {
  token: string;
  role: Role;
};

type CheckpointMarkersProps = {
  map: maplibregl.Map | null;
  token: string;
};

function CheckpointMarkers({ map, token }: CheckpointMarkersProps) {
  const markersRef = useRef<Marker[]>([]);
  const checkpoints = useQuery(tripcastApi.checkpoints.listCheckpoints, { token }) ?? [];

  useEffect(() => {
    if (!map) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
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
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [map, checkpoints]);

  return null;
}

type ConvexCheckpointSheetProps = {
  selectedCoordinate: SelectedCoordinate | null;
  token: string;
  onClose: () => void;
};

function ConvexCheckpointSheet({
  selectedCoordinate,
  token,
  onClose,
}: ConvexCheckpointSheetProps) {
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

export default function TripMap({ token, role }: TripMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const placementModeRef = useRef(false);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [selectedCoordinate, setSelectedCoordinate] = useState<SelectedCoordinate | null>(null);
  const [isPlacementMode, setIsPlacementMode] = useState(false);

  const canWrite = role === "traveler";

  useEffect(() => {
    placementModeRef.current = isPlacementMode;
  }, [isPlacementMode]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

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
      if (!placementModeRef.current) {
        return;
      }

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
  // canWrite is stable after mount; suppressing exhaustive-deps is correct here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mapClassName = useMemo(
    () => (isPlacementMode ? "h-full min-h-[420px] w-full cursor-crosshair" : "h-full min-h-[420px] w-full"),
    [isPlacementMode],
  );

  return (
    <section className="relative min-h-0 flex-1" aria-label="Checkpoint map">
      <div ref={mapContainerRef} className={mapClassName} />
      <CheckpointMarkers map={mapInstance} token={token} />

      <AnimatePresence>
        {isPlacementMode && (
          <motion.div
            key="placement-banner"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute left-1/2 top-4 z-[2] flex -translate-x-1/2 items-center gap-3 bg-navy text-white px-3 py-2.5 rounded-md shadow-lg max-w-[calc(100%-24px)]"
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
      </AnimatePresence>

      {canWrite ? (
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
      ) : null}

      {canWrite ? (
        <ConvexCheckpointSheet
          selectedCoordinate={selectedCoordinate}
          token={token}
          onClose={() => setSelectedCoordinate(null)}
        />
      ) : null}
    </section>
  );
}

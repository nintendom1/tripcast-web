import { useEffect, useMemo, useRef } from "react";
import maplibregl, { Marker } from "maplibre-gl";
import { useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { MysteryMissionFeedItem } from "../../convex/tripcastApi";

type Props = {
  map: maplibregl.Map | null;
  token: string;
  debugShowAll?: boolean;
  onMysteryMissionClick?: (missionId: string) => void;
  onMysteryMissionReveal?: (mission: MysteryMissionFeedItem) => void;
};

function getMysteryMarkerColor(mission: MysteryMissionFeedItem) {
  return mission.state === "signal" ? "#18181b" : "#3f3f46";
}

function decorateMarkerElement(element: HTMLElement, mission: MysteryMissionFeedItem) {
  element.classList.add("mystery-pin");
  element.classList.toggle("mystery-pin--signal", mission.state === "signal");
  element.classList.toggle("mystery-pin--revealed", mission.state === "revealed");
  element.setAttribute("role", "button");
  element.setAttribute("tabindex", "0");
  element.setAttribute(
    "aria-label",
    mission.state === "revealed" ? "Revealed Mystery Mission" : "Mystery Mission signal",
  );

  if (mission.state === "signal") {
    for (let i = 0; i < 5; i++) {
      const shard = document.createElement("span");
      shard.className = `mystery-pin__fizzle mystery-pin__fizzle--${i + 1}`;
      element.appendChild(shard);
    }
  }
}

function createPopupContent(mission: MysteryMissionFeedItem) {
  const wrapper = document.createElement("div");
  wrapper.className = "checkpoint-popup";

  const label = document.createElement("small");
  label.textContent = mission.state === "revealed" ? "Mystery revealed" : "Mystery signal";
  label.style.color = "#3f3f46";
  label.style.fontWeight = "700";
  label.style.textTransform = "uppercase";
  label.style.fontSize = "10px";
  label.style.letterSpacing = "0.05em";
  wrapper.appendChild(label);

  const title = document.createElement("strong");
  title.textContent = mission.state === "revealed"
    ? mission.trueIntent ?? mission.mysteryText
    : mission.mysteryText;
  wrapper.appendChild(title);

  return wrapper;
}

export default function MysteryMissionMarkers({
  map,
  token,
  debugShowAll = false,
  onMysteryMissionClick,
  onMysteryMissionReveal,
}: Props) {
  const markersRef = useRef<Map<string, { marker: Marker; state: string; lat: number; lon: number }>>(new Map());
  const onMysteryMissionClickRef = useRef(onMysteryMissionClick);
  onMysteryMissionClickRef.current = onMysteryMissionClick;
  const revealedIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const result = useQuery(
    tripcastApi.mysteryMissions.listMysteryMissionMapPins,
    debugShowAll ? { token, includeDebugAll: true } : "skip",
  );
  const pins = useMemo(() => (debugShowAll ? result?.rows ?? [] : []), [debugShowAll, result?.rows]);

  useEffect(() => {
    const revealed = new Set(pins.filter((pin) => pin.state === "revealed").map((pin) => pin._id));
    if (!initializedRef.current) {
      initializedRef.current = true;
      revealedIdsRef.current = revealed;
      return;
    }
    for (const pin of pins) {
      if (pin.state === "revealed" && !revealedIdsRef.current.has(pin._id)) {
        onMysteryMissionReveal?.(pin);
      }
    }
    revealedIdsRef.current = revealed;
  }, [onMysteryMissionReveal, pins]);

  useEffect(() => {
    if (!map) {
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current.clear();
      return;
    }

    const currentMarkers = markersRef.current;
    const nextIds = new Set<string>();

    pins.forEach((mission) => {
      const id = mission._id;
      nextIds.add(id);

      const existing = currentMarkers.get(id);

      if (existing) {
        if (existing.state !== mission.state || existing.lat !== mission.lat || existing.lon !== mission.lon) {
          if (typeof (existing.marker as any).getLngLat === "function") {
            existing.marker.setLngLat([mission.lon, mission.lat]);
          }
          // Update visual state (fizzles, etc.)
          const el = existing.marker.getElement();
          // Clear current fizzles if state changed from signal to revealed
          if (existing.state === "signal" && mission.state === "revealed") {
            el.querySelectorAll(".mystery-pin__fizzle").forEach((f) => f.remove());
          }
          decorateMarkerElement(el, mission);
          // Update popup content
          const popup = existing.marker.getPopup();
          if (popup) {
            popup.setDOMContent(createPopupContent(mission));
          }

          currentMarkers.set(id, {
            marker: existing.marker,
            state: mission.state,
            lat: mission.lat,
            lon: mission.lon
          });
        }
      } else {
        const popup = new maplibregl.Popup({ offset: 20 }).setDOMContent(
          createPopupContent(mission),
        );
        const marker = new maplibregl.Marker({ color: getMysteryMarkerColor(mission) })
          .setLngLat([mission.lon, mission.lat])
          .setPopup(popup)
          .addTo(map);
        const element = marker.getElement();
        decorateMarkerElement(element, mission);

        element.addEventListener("click", () => onMysteryMissionClickRef.current?.(mission._id));
        element.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onMysteryMissionClickRef.current?.(mission._id);
          }
        });

        currentMarkers.set(id, { marker, state: mission.state, lat: mission.lat, lon: mission.lon });
      }
    });

    // Remove old markers
    currentMarkers.forEach((entry, id) => {
      if (!nextIds.has(id)) {
        entry.marker.remove();
        currentMarkers.delete(id);
      }
    });
  }, [map, pins]);

  // Clean up all markers on unmount
  useEffect(() => {
    return () => {
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current.clear();
    };
  }, []);

  return null;
}

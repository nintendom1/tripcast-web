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
  onMysterySignalAppeared?: (mission: MysteryMissionFeedItem) => void;
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
  onMysterySignalAppeared,
}: Props) {
  const markersRef = useRef<{ marker: Marker; id: string }[]>([]);
  const revealedIdsRef = useRef<Set<string>>(new Set());
  const signalIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const result = useQuery(
    tripcastApi.mysteryMissions.listMysteryMissionMapPins,
    debugShowAll ? { token, includeDebugAll: true } : "skip",
  );
  const pins = useMemo(() => (debugShowAll ? result?.rows ?? [] : []), [debugShowAll, result?.rows]);

  useEffect(() => {
    const revealed = new Set(pins.filter((pin) => pin.state === "revealed").map((pin) => pin._id));
    const signals = new Set(pins.filter((pin) => pin.state === "signal").map((pin) => pin._id));

    if (!initializedRef.current) {
      initializedRef.current = true;
      revealedIdsRef.current = revealed;
      signalIdsRef.current = signals;
      return;
    }

    for (const pin of pins) {
      if (pin.state === "revealed" && !revealedIdsRef.current.has(pin._id)) {
        onMysteryMissionReveal?.(pin);
      }
      if (pin.state === "signal" && !signalIdsRef.current.has(pin._id)) {
        onMysterySignalAppeared?.(pin);
      }
    }

    revealedIdsRef.current = revealed;
    signalIdsRef.current = signals;
  }, [onMysteryMissionReveal, onMysterySignalAppeared, pins]);

  useEffect(() => {
    if (!map) return;

    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current = [];

    markersRef.current = pins.map((mission) => {
      const popup = new maplibregl.Popup({ offset: 20 }).setDOMContent(
        createPopupContent(mission),
      );
      const marker = new maplibregl.Marker({ color: getMysteryMarkerColor(mission) })
        .setLngLat([mission.lon, mission.lat])
        .setPopup(popup)
        .addTo(map);
      const element = marker.getElement();
      decorateMarkerElement(element, mission);

      if (onMysteryMissionClick) {
        element.addEventListener("click", () => onMysteryMissionClick(mission._id));
        element.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onMysteryMissionClick(mission._id);
          }
        });
      }

      return { marker, id: mission._id };
    });

    return () => {
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current = [];
    };
  }, [map, onMysteryMissionClick, pins]);

  return null;
}

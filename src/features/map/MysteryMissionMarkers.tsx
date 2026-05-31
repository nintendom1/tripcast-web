import { useEffect, useRef } from "react";
import maplibregl, { Marker } from "maplibre-gl";
import { useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { MysteryMissionFeedItem } from "../../convex/tripcastApi";

type Props = {
  map: maplibregl.Map | null;
  token: string;
  onMysteryMissionClick?: (missionId: string) => void;
};

function createMarkerElement(mission: MysteryMissionFeedItem) {
  const wrapper = document.createElement("button");
  wrapper.type = "button";
  wrapper.className =
    mission.state === "signal"
      ? "mystery-pin mystery-pin--signal"
      : "mystery-pin mystery-pin--revealed";
  wrapper.setAttribute(
    "aria-label",
    mission.state === "revealed" ? "Revealed Mystery Mission" : "Mystery Mission signal",
  );

  const drop = document.createElement("span");
  drop.className = "mystery-pin__drop";
  wrapper.appendChild(drop);

  if (mission.state === "signal") {
    for (let i = 0; i < 5; i++) {
      const shard = document.createElement("span");
      shard.className = `mystery-pin__fizzle mystery-pin__fizzle--${i + 1}`;
      wrapper.appendChild(shard);
    }
  }

  return wrapper;
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

export default function MysteryMissionMarkers({ map, token, onMysteryMissionClick }: Props) {
  const markersRef = useRef<{ marker: Marker; id: string }[]>([]);
  const result = useQuery(tripcastApi.mysteryMissions.listMysteryMissionMapPins, { token });
  const pins = result?.rows ?? [];

  useEffect(() => {
    if (!map) return;

    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current = [];

    markersRef.current = pins.map((mission) => {
      const element = createMarkerElement(mission);
      const popup = new maplibregl.Popup({ offset: 20 }).setDOMContent(
        createPopupContent(mission),
      );
      const marker = new maplibregl.Marker({ element })
        .setLngLat([mission.lon, mission.lat])
        .setPopup(popup)
        .addTo(map);

      if (onMysteryMissionClick) {
        element.addEventListener("click", () => onMysteryMissionClick(mission._id));
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

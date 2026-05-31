import { useEffect, useRef } from "react";
import maplibregl, { Marker } from "maplibre-gl";
import { useQuery } from "convex/react";
import { tripcastApi } from "../../convex/tripcastApi";
import type { Mission, Role } from "../../convex/tripcastApi";

// Visual style by lifecycle state
const STATUS_COLORS: Record<string, string> = {
  proposed: "#94a3b8",     // muted slate — only visible to traveler/proposer
  visible: "#1e3a5f",      // standard navy mission pin
  planned: "#1e3a5f",      // legacy — same as visible
  in_progress: "#d97706",  // amber - active mission
  completed: "#16a34a",    // green — completed
  dropped: "#94a3b8",      // muted — dropped
};

// listMissionMapPins only returns visible/planned/in_progress (+ proposed for traveler).
// Completed/dropped Mystery linked Missions are excluded server-side so their pins
// disappear like regular completed Missions do — see docs/mystery-missions.md.
const MYSTERY_STATUS_COLORS: Record<string, string> = {
  visible: "#09090b",
  planned: "#09090b",
  in_progress: "#27272a",
};

type Props = {
  map: maplibregl.Map | null;
  token: string;
  role: Role;
  onMissionClick?: (missionId: string) => void;
};

function createPopupContent(Mission: Mission) {
  const wrapper = document.createElement("div");
  wrapper.className = "checkpoint-popup";
  const isMystery = Mission.source === "mystery";
  const color = isMystery
    ? MYSTERY_STATUS_COLORS[Mission.status] ?? "#09090b"
    : STATUS_COLORS[Mission.status] ?? "#1e3a5f";

  const label = document.createElement("small");
  label.textContent = isMystery ? "Mystery Mission" : "Mission";
  label.style.color = color;
  label.style.fontWeight = "700";
  label.style.textTransform = "uppercase";
  label.style.fontSize = "10px";
  label.style.letterSpacing = "0.05em";
  wrapper.appendChild(label);

  const title = document.createElement("strong");
  title.textContent = Mission.title;
  wrapper.appendChild(title);

  if (isMystery && (Mission.status === "visible" || Mission.status === "planned")) {
    const note = document.createElement("small");
    note.textContent = "Unlocked";
    note.style.color = "#52525b";
    note.style.display = "block";
    wrapper.appendChild(note);
  } else if (Mission.status === "proposed") {
    const note = document.createElement("small");
    note.textContent = "Pending review";
    note.style.color = "#64748b";
    note.style.display = "block";
    wrapper.appendChild(note);
  } else if (Mission.status === "in_progress") {
    const note = document.createElement("small");
    note.textContent = isMystery ? "Active" : "In progress";
    note.style.color = isMystery ? "#3f3f46" : "#d97706";
    note.style.display = "block";
    wrapper.appendChild(note);
  } else if (Mission.status === "completed") {
    const note = document.createElement("small");
    note.textContent = "Completed";
    note.style.color = "#16a34a";
    note.style.display = "block";
    wrapper.appendChild(note);
  }

  return wrapper;
}

export default function MissionMarkers({ map, token, role, onMissionClick }: Props) {
  const markersRef = useRef<{ marker: Marker; id: string }[]>([]);

  const pins = useQuery(tripcastApi.missions.listMissionMapPins, { token });
  const preferences = useQuery(tripcastApi.travelerPreferences.followerGetPreferences, role === "follower" ? { token } : "skip");
  const cutoffAt = preferences?.visible ? (preferences as any).followerContentCutoffAt : undefined;

  useEffect(() => {
    if (!map) return;

    // Remove old markers
    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current = [];

    if (!pins) return;

    markersRef.current = pins
      .filter((c) => c.lat !== undefined && c.lon !== undefined)
      .filter((c) => role === "traveler" || !cutoffAt || c.createdAt >= cutoffAt)
      .map((Mission) => {
        const color = Mission.source === "mystery"
          ? MYSTERY_STATUS_COLORS[Mission.status] ?? "#09090b"
          : STATUS_COLORS[Mission.status] ?? "#1e3a5f";
        const popup = new maplibregl.Popup({ offset: 20 }).setDOMContent(
          createPopupContent(Mission),
        );

        const marker = new maplibregl.Marker({ color })
          .setLngLat([Mission.lon!, Mission.lat!])
          .setPopup(popup)
          .addTo(map);

        if (onMissionClick) {
          marker.getElement().addEventListener("click", () => {
            onMissionClick(Mission._id);
          });
        }

        return { marker, id: Mission._id };
      });

    return () => {
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current = [];
    };
  }, [map, pins, onMissionClick]);

  return null;
}

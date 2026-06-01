import { useEffect, useRef } from "react";
import maplibregl, { Marker } from "maplibre-gl";
import { useQuery } from "convex/react";
import { tripcastApi } from "../../convex/tripcastApi";
import type { Mission, Role } from "../../convex/tripcastApi";
import { useFollowerCutoffPreview } from "../options/followerCutoffPreview";

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
  const markersRef = useRef<Map<string, { marker: Marker; status: string; source: string; lat: number; lon: number; title: string }>>(new Map());
  const onMissionClickRef = useRef(onMissionClick);
  onMissionClickRef.current = onMissionClick;

  const pins = useQuery(tripcastApi.missions.listMissionMapPins, { token });
  const preview = useFollowerCutoffPreview(role, token);

  useEffect(() => {
    if (!map) {
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current.clear();
      return;
    }

    if (!pins) return;

    const currentMarkers = markersRef.current;
    const nextIds = new Set<string>();

    pins.forEach((mission) => {
      if (mission.lat === undefined || mission.lon === undefined) return;
      // Follower content cutoff
      if (preview.cutoffAt !== null && mission.createdAt < preview.cutoffAt) return;

      const id = mission._id;
      nextIds.add(id);

      const existing = currentMarkers.get(id);
      const color = mission.source === "mystery"
        ? MYSTERY_STATUS_COLORS[mission.status] ?? "#09090b"
        : STATUS_COLORS[mission.status] ?? "#1e3a5f";

      if (existing) {
        // Reconciliation: update only if state changed
        const changed =
          existing.status !== mission.status ||
          existing.source !== mission.source ||
          existing.lat !== mission.lat ||
          existing.lon !== mission.lon ||
          existing.title !== mission.title;

        if (changed) {
          if (typeof (existing.marker as any).getLngLat === "function") {
            existing.marker.setLngLat([mission.lon, mission.lat]);
          }
          // Update popup content
          const popup = existing.marker.getPopup();
          if (popup) {
            popup.setDOMContent(createPopupContent(mission));
          }
          // Note: maplibregl.Marker doesn't have a setColor method,
          // so if the color changes we have to recreate or manipulate the DOM.
          // Since color change is relatively rare (mission status change),
          // recreating only this marker is still a win over recreating all.
          if (existing.status !== mission.status || existing.source !== mission.source) {
            existing.marker.remove();
            const newMarker = new maplibregl.Marker({ color })
              .setLngLat([mission.lon, mission.lat])
              .setPopup(new maplibregl.Popup({ offset: 20 }).setDOMContent(createPopupContent(mission)))
              .addTo(map);

            newMarker.getElement().addEventListener("click", () => {
              onMissionClickRef.current?.(mission._id);
            });

            currentMarkers.set(id, {
              marker: newMarker,
              status: mission.status,
              source: mission.source,
              lat: mission.lat,
              lon: mission.lon,
              title: mission.title
            });
          } else {
            currentMarkers.set(id, {
              ...existing,
              lat: mission.lat,
              lon: mission.lon,
              title: mission.title
            });
          }
        }
      } else {
        // Add new marker
        const popup = new maplibregl.Popup({ offset: 20 }).setDOMContent(
          createPopupContent(mission),
        );

        const marker = new maplibregl.Marker({ color })
          .setLngLat([mission.lon, mission.lat])
          .setPopup(popup)
          .addTo(map);

        marker.getElement().addEventListener("click", () => {
          onMissionClickRef.current?.(mission._id);
        });

        currentMarkers.set(id, {
          marker,
          status: mission.status,
          source: mission.source,
          lat: mission.lat,
          lon: mission.lon,
          title: mission.title
        });
      }
    });

    // Remove markers that are no longer present
    currentMarkers.forEach((entry, id) => {
      if (!nextIds.has(id)) {
        entry.marker.remove();
        currentMarkers.delete(id);
      }
    });
  }, [map, pins, preview.cutoffAt]);

  // Clean up all markers on unmount
  useEffect(() => {
    return () => {
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current.clear();
    };
  }, []);

  return null;
}

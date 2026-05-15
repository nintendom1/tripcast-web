import { useEffect, useRef } from "react";
import maplibregl, { Marker } from "maplibre-gl";
import { useQuery } from "convex/react";
import { tripcastApi } from "../../convex/tripcastApi";
import type { Challenge, Role } from "../../convex/tripcastApi";

// Visual style by lifecycle state
const STATUS_COLORS: Record<string, string> = {
  proposed: "#94a3b8",     // muted slate — only visible to traveler/proposer
  visible: "#1e3a5f",      // standard navy challenge pin
  planned: "#1e3a5f",      // legacy — same as visible
  in_progress: "#d97706",  // amber — active challenge
  completed: "#16a34a",    // green — completed
  dropped: "#94a3b8",      // muted — dropped
};

type Props = {
  map: maplibregl.Map | null;
  token: string;
  role: Role;
  onChallengeClick?: (challengeId: string) => void;
};

function createPopupContent(challenge: Challenge) {
  const wrapper = document.createElement("div");
  wrapper.className = "checkpoint-popup";

  const label = document.createElement("small");
  label.textContent = "Challenge";
  label.style.color = STATUS_COLORS[challenge.status] ?? "#1e3a5f";
  label.style.fontWeight = "700";
  label.style.textTransform = "uppercase";
  label.style.fontSize = "10px";
  label.style.letterSpacing = "0.05em";
  wrapper.appendChild(label);

  const title = document.createElement("strong");
  title.textContent = challenge.title;
  wrapper.appendChild(title);

  if (challenge.status === "proposed") {
    const note = document.createElement("small");
    note.textContent = "Pending review";
    note.style.color = "#64748b";
    note.style.display = "block";
    wrapper.appendChild(note);
  } else if (challenge.status === "in_progress") {
    const note = document.createElement("small");
    note.textContent = "In progress";
    note.style.color = "#d97706";
    note.style.display = "block";
    wrapper.appendChild(note);
  } else if (challenge.status === "completed") {
    const note = document.createElement("small");
    note.textContent = "Completed";
    note.style.color = "#16a34a";
    note.style.display = "block";
    wrapper.appendChild(note);
  }

  return wrapper;
}

export default function ChallengeMarkers({ map, token, role, onChallengeClick }: Props) {
  const markersRef = useRef<{ marker: Marker; id: string }[]>([]);

  const pins = useQuery(tripcastApi.challenges.listChallengeMapPins, { token });

  useEffect(() => {
    if (!map) return;

    // Remove old markers
    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current = [];

    if (!pins) return;

    markersRef.current = pins
      .filter((c) => c.lat !== undefined && c.lon !== undefined)
      .map((challenge) => {
        const color = STATUS_COLORS[challenge.status] ?? "#1e3a5f";
        const popup = new maplibregl.Popup({ offset: 20 }).setDOMContent(
          createPopupContent(challenge),
        );

        const marker = new maplibregl.Marker({ color })
          .setLngLat([challenge.lon!, challenge.lat!])
          .setPopup(popup)
          .addTo(map);

        if (onChallengeClick) {
          marker.getElement().addEventListener("click", () => {
            onChallengeClick(challenge._id);
          });
        }

        return { marker, id: challenge._id };
      });

    return () => {
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current = [];
    };
  }, [map, pins, onChallengeClick]);

  return null;
}

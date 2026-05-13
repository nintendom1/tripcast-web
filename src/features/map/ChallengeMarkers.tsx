import { useEffect, useRef } from "react";
import maplibregl, { Marker } from "maplibre-gl";
import type { RouteVoteListItem } from "../../convex/tripcastApi";
import { isFiniteRouteCoordinate } from "../../lib/routeVoteUtils";

type ChallengeMarkersProps = {
  map: maplibregl.Map | null;
  votes: RouteVoteListItem[];
};

type ChallengePin = {
  id: string;
  title: string;
  lat: number;
  lon: number;
};

function extractChallengePin(vote: RouteVoteListItem): ChallengePin | null {
  if (!vote.confirmedWinningOptionId || vote.effectiveStatus !== "resolved") return null;
  const option = vote.options.find((o) => o._id === vote.confirmedWinningOptionId);
  if (!isFiniteRouteCoordinate(option)) return null;
  return { id: vote._id, title: option.title, lat: option.lat, lon: option.lon };
}

function createChallengePopupContent(pin: ChallengePin) {
  const wrapper = document.createElement("div");
  wrapper.className = "checkpoint-popup";
  const label = document.createElement("small");
  label.textContent = "Challenge";
  label.style.color = "#102a43";
  label.style.fontWeight = "700";
  label.style.textTransform = "uppercase";
  label.style.fontSize = "10px";
  label.style.letterSpacing = "0.05em";
  wrapper.appendChild(label);
  const title = document.createElement("strong");
  title.textContent = pin.title;
  wrapper.appendChild(title);
  return wrapper;
}

export default function ChallengeMarkers({ map, votes }: ChallengeMarkersProps) {
  const markersRef = useRef<Marker[]>([]);

  useEffect(() => {
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const pins = votes.flatMap((v) => {
      const pin = extractChallengePin(v);
      return pin ? [pin] : [];
    });

    markersRef.current = pins.map((pin) => {
      const popup = new maplibregl.Popup({ offset: 20 }).setDOMContent(
        createChallengePopupContent(pin),
      );
      return new maplibregl.Marker({ color: "#102a43" })
        .setLngLat([pin.lon, pin.lat])
        .setPopup(popup)
        .addTo(map);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [map, votes]);

  return null;
}

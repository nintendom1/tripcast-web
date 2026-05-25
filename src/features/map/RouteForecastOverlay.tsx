import { useEffect, useRef } from "react";
import maplibregl, { Marker } from "maplibre-gl";

import type { RouteForecast } from "../../convex/tripcastApi";

const SOURCE_ID = "route-forecast-overlay";
const LINE_LAYER_ID = "route-forecast-line";

type Props = {
  map: maplibregl.Map | null;
  forecasts: RouteForecast[];
  origin: { lat: number; lon: number } | null;
  visible: boolean;
  onOpen: (forecast: RouteForecast) => void;
  onEdit: (forecast: RouteForecast) => void;
  onDelete: (forecast: RouteForecast) => void;
};

function removeLine(map: maplibregl.Map) {
  if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

function addLine(map: maplibregl.Map, origin: { lat: number; lon: number } | null, forecasts: RouteForecast[]) {
  const coordinates = [
    ...(origin ? [[origin.lon, origin.lat]] : []),
    ...forecasts.map((forecast) => [forecast.lon, forecast.lat]),
  ];
  if (coordinates.length < 2) return;

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: { type: "LineString", coordinates },
      properties: {},
    },
  });
  map.addLayer({
    id: LINE_LAYER_ID,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": "#7a9cdc",
      "line-width": 2,
      "line-dasharray": [2, 3],
      "line-opacity": 0.55,
    },
  });
}

function createPopup(
  forecast: RouteForecast,
  onEdit: (forecast: RouteForecast) => void,
  onDelete: (forecast: RouteForecast) => void,
) {
  const wrapper = document.createElement("div");
  wrapper.className = "checkpoint-popup";

  const label = document.createElement("small");
  label.textContent = "Forecast route · plans may change";
  label.style.color = "#5272b8";
  label.style.fontWeight = "700";
  label.style.textTransform = "uppercase";
  label.style.fontSize = "10px";
  wrapper.appendChild(label);

  const title = document.createElement("strong");
  title.textContent = forecast.title;
  wrapper.appendChild(title);

  if (forecast.locationLabel) {
    const location = document.createElement("small");
    location.textContent = forecast.locationLabel;
    location.style.display = "block";
    wrapper.appendChild(location);
  }

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "6px";
  actions.style.marginTop = "8px";

  const edit = document.createElement("button");
  edit.type = "button";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => onEdit(forecast));
  actions.appendChild(edit);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Delete";
  remove.addEventListener("click", () => onDelete(forecast));
  actions.appendChild(remove);

  wrapper.appendChild(actions);
  return wrapper;
}

export default function RouteForecastOverlay({
  map,
  forecasts,
  origin,
  visible,
  onOpen,
  onEdit,
  onDelete,
}: Props) {
  const markersRef = useRef<Marker[]>([]);

  useEffect(() => {
    if (!map) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    if (map.isStyleLoaded()) removeLine(map);

    if (!visible || forecasts.length === 0) return;

    const add = () => {
      removeLine(map);
      addLine(map, origin, forecasts);
    };

    if (map.isStyleLoaded()) add();
    else map.once("styledata", add);

    markersRef.current = forecasts.map((forecast) => {
      const marker = new maplibregl.Marker({ color: "#9fb2ff" })
        .setLngLat([forecast.lon, forecast.lat])
        .setPopup(new maplibregl.Popup({ offset: 20 }).setDOMContent(createPopup(forecast, onEdit, onDelete)))
        .addTo(map);
      marker.getElement().style.opacity = "0.72";
      marker.getElement().addEventListener("click", () => onOpen(forecast));
      return marker;
    });

    return () => {
      map.off("styledata", add);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      if (map.isStyleLoaded()) removeLine(map);
    };
  }, [forecasts, map, onDelete, onEdit, onOpen, origin, visible]);

  return null;
}

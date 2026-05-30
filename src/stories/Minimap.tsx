import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export function Minimap({ children }: { children: (map: maplibregl.Map | null) => React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [0, 0],
      zoom: 1,
    });
    m.on("load", () => setMap(m));
    return () => { m.remove(); };
  }, []);

  return (
    <div ref={containerRef} className="h-[400px] w-full rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] relative">
      {children(map)}
    </div>
  );
}

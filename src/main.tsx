import { ConvexProvider, ConvexReactClient } from "convex/react";
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { MovementDebugProvider } from "./providers/MovementDebugProvider";
import { MusicProvider } from "./providers/MusicProvider";
import { ReadingSpeedProvider } from "./providers/ReadingSpeedProvider";
import "./styles.css";
import "react-medium-image-zoom/dist/styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;

// Register the basemap tile-cache Service Worker on the web build only (not the
// Capacitor native build, and not in dev where it would fight HMR). Scoped to
// the app base so it can intercept MapLibre's OpenFreeMap tile fetches.
if (
  import.meta.env.PROD &&
  import.meta.env.MODE !== "capacitor" &&
  typeof navigator !== "undefined" &&
  "serviceWorker" in navigator
) {
  window.addEventListener("load", () => {
    const base = import.meta.env.BASE_URL || "/";
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .catch(() => {
        // Caching is best-effort; the map still works straight from the network.
      });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MusicProvider>
      <ReadingSpeedProvider>
        <MovementDebugProvider>
          {convexUrl ? (
            <ConvexProvider client={new ConvexReactClient(convexUrl)}>
              <App convexReady />
            </ConvexProvider>
          ) : (
            <App convexReady={false} />
          )}
        </MovementDebugProvider>
      </ReadingSpeedProvider>
    </MusicProvider>
  </React.StrictMode>,
);

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

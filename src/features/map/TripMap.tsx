import "maplibre-gl/dist/maplibre-gl.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsDesktop } from "../../lib/useIsDesktop";
import { DesktopMapFrame } from "../layout/DesktopMapFrame";
import { useConvex, useMutation, useQuery } from "convex/react";
import maplibregl, { Marker } from "maplibre-gl";
import { AnimatePresence, motion } from "framer-motion";
import { Crosshair, DollarSign, EyeOff, Pause, Play, RotateCcw, Trash2, X } from "lucide-react";
import {
  tripcastApi,
  type AddCheckpointArgs,
  type BadgeType,
  type Checkpoint,
  type CloakingPin,
  type JournalEvent,
  type LiveTrailReplayPage,
  type LiveTrailSample,
  type Role,
  type RouteVoteMapOverlay as RouteVoteMapOverlayType,
  type Transaction,
} from "../../convex/tripcastApi";
import AddCheckpointSheet, {
  type CheckpointPrefill,
  type SelectedCoordinate,
} from "./AddCheckpointSheet";
import RouteVoteMapOverlay from "./RouteVoteMapOverlay";
import {
  MapPickerConfirmPanel,
  MapPickerCrosshair,
  MapPickerHelperBanner,
} from "./MapPicker";
import MissionMarkers from "./MissionMarkers";
import MysteryMissionMarkers from "./MysteryMissionMarkers";
import MissionPanel from "../missions/MissionPanel";
import RouteVotePanel from "../routevote/RouteVotePanel";
import VoteTimeSplash from "../routevote/VoteTimeSplash";
import TravelerStateSheet from "../travelstate/TravelerStateSheet";
import TravelFundsSheet from "../travelfunds/TravelFundsSheet";
import { useFollowerCutoffPreview } from "../options/followerCutoffPreview";
import {
  Dock,
  type DockTab,
  FanMenu,
  type FanAction,
  FundsCompactConnected,
  LivePill,
  MapCenterButton,
  MusicMuteIndicator,
  StatusCardConnected,
} from "../hud";
import {
  isNativeLocationAvailable,
  openNativeLocationSettings,
  startNativeLocationWatch,
} from "../../native/locationWatcher";
import LinkedTransactionsSection from "../travelfunds/LinkedTransactionsSection";
import {
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetTitle,
} from "../../components/ui/sheet";
import JournalSheet from "../journal/JournalSheet";
import StoryDetailSheet from "../journal/StoryDetailSheet";
import { uploadStoryImage } from "../journal/storyImageUpload";
import AchievementsConnected from "../achievements/AchievementsConnected";
import { MessagingSheet } from "../messaging/MessagingSheet";
import { useMessagingUnread } from "../messaging/useMessagingUnread";
import { useJournalUnread } from "../journal/useJournalUnread";
import { FeatureBoundary } from "../../components/resilience/FeatureBoundary";
import {
  useMovementDebugRecords,
  useMovementDebugSpeed,
} from "../../providers/MovementDebugProvider";
import { useMusicSafe } from "../../providers/MusicProvider";
import { DEFAULT_MOVING_MPS, DEFAULT_WALKING_MPS } from "../../lib/movementUnits";
import { useTripAudioScenario } from "../../lib/audio/useTripAudioScenario";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useCenteringCalibration } from "../../debug/useCenteringCalibration";
import {
  bandFractionOf,
  isOccluded,
  readFocusGeometry,
  readOccluderPadding,
  type FocusGeometry,
} from "./focusCoordinate";
import { circlePolygon } from "./circlePolygon";
import { useTripPath } from "./useTripPath";
import { useCloakingZones } from "./useCloakingZones";
import { DebugChip } from "../../debug/DebugChip";
import { useTheme } from "../../providers/ThemeProvider";
import { cn } from "../../lib/utils";
import { isEnabled, isCategoryEnabled, log as rawLog, logMapError, logMapEvent } from "../../debug/debugLogger";
import {
  MOOD_LABELS,
  MOOD_VALUES,
  ENERGY_LABELS,
  ENERGY_VALUES,
  STOMACH_LABELS,
  STOMACH_VALUES,
  STRESS_LABELS,
  STRESS_VALUES,
  SCHEDULE_LABELS,
  SCHEDULE_VALUES,
  ENERGY_SCORE_FOR_LEVEL,
  STRESS_SCORE_FOR_LEVEL,
  STOMACH_SCORE_FOR_LEVEL,
} from "../travelstate/travelerStateUtils";
import { isFiniteRouteCoordinate } from "../../lib/routeVoteUtils";
import { TERMS } from "../../copy/terminology";
import { useSheetPersonalities } from "../redesign/sheetPersonality";
import {
  getActiveMapCooldown,
  getMapProxyConfigHint,
  getMapStyleResolution,
  MAP_COOLDOWN_EVENT,
  MAP_COOLDOWN_KEY,
  readMapCooldownState,
  resetMapCooldown,
  triggerMapCooldown,
  type MapCooldownState,
} from "./mapService";

const SEATTLE_CENTER: [number, number] = [-122.3321, 47.6062];
const MIN_LOCATION_PUBLISH_INTERVAL_MS = 15_000;
const LIVE_TRAIL_MIN_DISTANCE_METERS = 200;
const LIVE_TRAIL_MIN_INTERVAL_MS = 60_000;
const REPLAY_TRAIL_PAGE_SIZE = 500;
const REPLAY_TRAIL_ESTIMATED_BYTES_PER_SAMPLE = 106;
const REPLAY_BASE_BEAT_MS = 1000;
const REPLAY_LAST_PIN_KEY_PREFIX = "tripcast.replay.lastPin.";

type ReplayResume = { eventId: string; index: number };

function readReplayResume(token: string): ReplayResume | null {
  try {
    const raw = localStorage.getItem(`${REPLAY_LAST_PIN_KEY_PREFIX}${token}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReplayResume>;
    if (typeof parsed.eventId !== "string" || typeof parsed.index !== "number") return null;
    return { eventId: parsed.eventId, index: parsed.index };
  } catch {
    return null;
  }
}

function writeReplayResume(token: string, value: ReplayResume) {
  try {
    localStorage.setItem(`${REPLAY_LAST_PIN_KEY_PREFIX}${token}`, JSON.stringify(value));
  } catch {
    // Quota or private-mode — silently swallow; resume is best-effort.
  }
}

function clearReplayResume(token: string) {
  try {
    localStorage.removeItem(`${REPLAY_LAST_PIN_KEY_PREFIX}${token}`);
  } catch {
    // ignore
  }
}

function resolveReplayResumeIndex(token: string, pins: ReplayPin[]): number {
  if (pins.length === 0) return 0;
  const stored = readReplayResume(token);
  if (!stored) return 0;
  const byId = pins.findIndex((p) => p.eventId === stored.eventId);
  if (byId >= 0) return byId;
  return Math.min(Math.max(0, stored.index), pins.length - 1);
}

const BOTTOM_SHEET_ERROR_CLASS =
  "absolute inset-x-0 bottom-0 z-[4] grid gap-3 border-t bg-background p-4 text-sm shadow-lg";
const CARD_ERROR_CLASS =
  "grid w-56 gap-3 rounded-md border bg-background/95 p-3 text-xs shadow-md backdrop-blur-sm";


type CoordinatePickMode = {
  label: string;
  callback: (coord: { lat: number; lon: number }) => void;
  /** Sheet selector that owns the originating form, used to re-center the
   * map above it after confirm so the picked point isn't hidden by the sheet. */
  sheetSelector: string | null;
  /** Existing coordinate the form holds (e.g. when editing an existing pin via
   * "Change"). The picker eases the map to this point on entry so the user
   * starts looking at the original location instead of wherever they were panning. */
  initialCoord?: { lat: number; lon: number } | null;
};

export type CoordinatePickOptions = {
  initialCoord?: { lat: number; lon: number } | null;
};

export type CoordinatePickRequest = (
  callback: (coord: { lat: number; lon: number }) => void,
  options?: CoordinatePickOptions,
) => void;

export type RouteVoteCoordinatePickRequest = (
  optionIndex: number,
  callback: (coord: { lat: number; lon: number }) => void,
  options?: CoordinatePickOptions,
) => void;

type DebugOpenSource = {
  source: string;
  sourceLabel: string;
};

type ReplayPin = {
  eventId: string;
  occurredAt: number;
  lat: number;
  lon: number;
  kind: "checkpoint" | "breadcrumb";
};

type FocusEntry = {
  coord: { lat: number; lon: number };
  trigger: string;
  sheetSelector: string | null;
  minZoom?: number;
  geometry: FocusGeometry;
};

type ActiveFocus =
  | {
      kind: "center";
      coord: { lat: number; lon: number };
      trigger: string;
      sheetSelector: string | null;
      minZoom?: number;
      duration?: number;
    }
  | {
      kind: "fit";
      bounds: [[number, number], [number, number]];
      trigger: string;
      sheetSelector: string | null;
      maxZoom?: number;
      duration?: number;
    };

/** How long after a focus the user's first pan counts as "teach me the spot". */
const FOCUS_TEACH_WINDOW_MS = 8_000;
/** In calibration mode, ignore teach drags smaller than this (mouse jitter). */
const FOCUS_ADJUST_MIN_PX = 20;
/** Sheet height change (px) below which a resize does not trigger a recenter. */
const SHEET_RESIZE_THRESHOLD_PX = 8;
/** A sheet shorter than this is closing/animating out — never recenter for it. */
const SHEET_MIN_OPEN_PX = 120;
/** Debounce window collapsing animate-in resize frames into one recenter. */
const SHEET_RESIZE_DEBOUNCE_MS = 120;

const UNKNOWN_DEBUG_SOURCE: DebugOpenSource = {
  source: "unknown",
  sourceLabel: "Unknown",
};

function isFiniteLngLatBounds(
  bounds: [[number, number], [number, number]],
) {
  return bounds.every(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isFiniteReplayCoordinate(event: JournalEvent): event is JournalEvent & { lat: number; lon: number } {
  return (
    typeof event.lat === "number" &&
    Number.isFinite(event.lat) &&
    typeof event.lon === "number" &&
    Number.isFinite(event.lon)
  );
}

function buildReplayPins(
  journalEvents: JournalEvent[],
  liveTrailSamples: Array<{ _id?: string; lat: number; lon: number; sampledAt: number }>,
) {
  const checkpointPins: ReplayPin[] = journalEvents
    .filter(isFiniteReplayCoordinate)
    .map((event) => ({
      eventId: event._id,
      occurredAt: event.occurredAt,
      lat: event.lat,
      lon: event.lon,
      kind: "checkpoint" as const,
    }));

  const MIN_REPLAY_BC_INTERVAL_MS = 60_000;
  let lastKeptAt = -Infinity;
  const breadcrumbPins: ReplayPin[] = [];
  for (const s of [...liveTrailSamples].sort((a, b) => a.sampledAt - b.sampledAt)) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
    if (s.sampledAt - lastKeptAt >= MIN_REPLAY_BC_INTERVAL_MS) {
      breadcrumbPins.push({
        eventId: s._id ?? `bc-${s.sampledAt}`,
        occurredAt: s.sampledAt,
        lat: s.lat,
        lon: s.lon,
        kind: "breadcrumb" as const,
      });
      lastKeptAt = s.sampledAt;
    }
  }

  return [...checkpointPins, ...breadcrumbPins].sort((a, b) => a.occurredAt - b.occurredAt);
}

function formatReplayTime(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function roundedCoordinate(value: number) {
  return Number(value.toFixed(4));
}

function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const radiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLon = toRadians(b.lon - a.lon);
  const hav =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * radiusMeters * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
}

function mapLibreErrorDetails(event: unknown) {
  const eventRecord = asRecord(event);
  const error = asRecord(eventRecord?.error) ?? eventRecord;
  const response = asRecord(error?.response);
  const request = asRecord(error?.request);
  const resource = asRecord(error?.resource);
  const status =
    getNumber(error?.status) ??
    getNumber(error?.statusCode) ??
    getNumber(response?.status);
  const url =
    getString(error?.url) ??
    getString(request?.url) ??
    getString(resource?.url) ??
    getString(response?.url);

  return {
    message: getString(error?.message),
    status,
    url,
    component: getString(error?.component),
  };
}

function mapResourceKind(url?: string, component?: string): "style" | "tilejson" | "tile" | "asset" | "unknown" {
  if (component === "style") return "style";
  if (!url) return "unknown";
  try {
    const path = new URL(url, window.location.origin).pathname;
    if (path.includes("/map/style")) return "style";
    if (path.includes("/map/tilejson/")) return "tilejson";
    if (path.includes("/map/tile/")) return "tile";
    if (path.includes("/map/asset/")) return "asset";
  } catch {
    return "unknown";
  }
  return "unknown";
}

function createMapFailureStats() {
  return {
    counts: {} as Record<string, number>,
    sampleKeys: new Set<string>(),
    samples: [] as Array<{
      status?: number;
      url?: string;
      kind: string;
      message?: string;
    }>,
    total: 0,
  };
}

function setMapInteractionsEnabled(map: maplibregl.Map, enabled: boolean) {
  const handlers = [
    map.dragPan,
    map.scrollZoom,
    map.boxZoom,
    map.dragRotate,
    map.keyboard,
    map.doubleClickZoom,
    map.touchZoomRotate,
  ];
  for (const handler of handlers) {
    if (enabled) {
      handler.enable();
    } else {
      handler.disable();
    }
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------


function CheckpointMarkers({
  map,
  checkpoints,
  onCheckpointClick,
}: {
  map: maplibregl.Map | null;
  checkpoints: Checkpoint[];
  onCheckpointClick: (checkpoint: Checkpoint) => void;
}) {
  const markersRef = useRef<Marker[]>([]);
  const onClickRef = useRef(onCheckpointClick);
  onClickRef.current = onCheckpointClick;

  useEffect(() => {
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = checkpoints.filter((cp) => cp.lat !== undefined && cp.lon !== undefined).map((checkpoint) => {
      const marker = new maplibregl.Marker({ color: "#d92332" })
        .setLngLat([checkpoint.lon!, checkpoint.lat!])
        .addTo(map);

      const el = marker.getElement();
      el.style.cursor = "pointer";
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onClickRef.current(checkpoint);
      });

      return marker;
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  // onCheckpointClick intentionally omitted — kept fresh via onClickRef

  }, [map, checkpoints]);

  return null;
}

function AccuracyCircle({
  map,
  position,
  isVisible,
  color,
}: {
  map: maplibregl.Map | null;
  position: { lat: number; lon: number; accuracy?: number } | null;
  isVisible: boolean;
  color: string;
}) {
  useEffect(() => {
    if (!map) return;

    const isStyleReady = () => map.isStyleLoaded() === true;
    const removeAccuracyCircle = () => {
      if (!isStyleReady()) return;
      if (map.getLayer("accuracy-circle-fill")) map.removeLayer("accuracy-circle-fill");
      if (map.getLayer("accuracy-circle-stroke")) map.removeLayer("accuracy-circle-stroke");
      if (map.getSource("accuracy-circle")) map.removeSource("accuracy-circle");
    };

    const syncAccuracyCircle = () => {
      if (!position || !position.accuracy || !isVisible) {
        removeAccuracyCircle();
        return;
      }

      if (!isStyleReady()) return;

      const geojson = circlePolygon(position.lat, position.lon, position.accuracy);
      const source = map.getSource("accuracy-circle") as maplibregl.GeoJSONSource | undefined;

      if (source) {
        if (typeof source.setData === "function") {
          source.setData(geojson);
        }
        if (typeof map.setPaintProperty === "function") {
          if (map.getLayer("accuracy-circle-fill")) {
            map.setPaintProperty("accuracy-circle-fill", "fill-color", color);
          }
          if (map.getLayer("accuracy-circle-stroke")) {
            map.setPaintProperty("accuracy-circle-stroke", "line-color", color);
          }
        }
      } else if (typeof map.addSource === "function") {
        map.addSource("accuracy-circle", {
          type: "geojson",
          data: geojson,
        });
      }

      if (!map.getLayer("accuracy-circle-fill") && typeof map.addLayer === "function") {
        map.addLayer({
          id: "accuracy-circle-fill",
          type: "fill",
          source: "accuracy-circle",
          paint: {
            "fill-color": color,
            "fill-opacity": 0.12,
          },
        });
      }

      if (!map.getLayer("accuracy-circle-stroke") && typeof map.addLayer === "function") {
        map.addLayer({
          id: "accuracy-circle-stroke",
          type: "line",
          source: "accuracy-circle",
          paint: {
            "line-color": color,
            "line-width": 1,
            "line-opacity": 0.25,
          },
        });
      }
    };

    syncAccuracyCircle();
    const loadSubscription = map.on("load", syncAccuracyCircle);
    const styleLoadSubscription = map.on("style.load", syncAccuracyCircle);

    return () => {
      if (typeof loadSubscription.unsubscribe === "function") {
        loadSubscription.unsubscribe();
      } else if (typeof (map as { off?: (event: string, listener: () => void) => void }).off === "function") {
        (map as { off: (event: string, listener: () => void) => void }).off("load", syncAccuracyCircle);
      }
      if (typeof styleLoadSubscription.unsubscribe === "function") {
        styleLoadSubscription.unsubscribe();
      } else if (typeof (map as { off?: (event: string, listener: () => void) => void }).off === "function") {
        (map as { off: (event: string, listener: () => void) => void }).off("style.load", syncAccuracyCircle);
      }
    };
  }, [map, position, isVisible, color]);

  // Final cleanup on unmount
  useEffect(() => {
    return () => {
      if (map) {
        if (map.isStyleLoaded() !== true) return;
        if (map.getLayer("accuracy-circle-fill")) map.removeLayer("accuracy-circle-fill");
        if (map.getLayer("accuracy-circle-stroke")) map.removeLayer("accuracy-circle-stroke");
        if (map.getSource("accuracy-circle")) map.removeSource("accuracy-circle");
      }
    };
  }, [map]);

  return null;
}

function PreviewPinMarker({
  map,
  coord,
}: {
  map: maplibregl.Map | null;
  coord: { lat: number; lon: number } | null;
}) {
  const markerRef = useRef<maplibregl.Marker | null>(null);
  useEffect(() => {
    if (!map) return;
    if (!coord || !Number.isFinite(coord.lat) || !Number.isFinite(coord.lon)) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (markerRef.current) {
      markerRef.current.setLngLat([coord.lon, coord.lat]);
    } else {
      const el = document.createElement("div");
      el.className = "preview-pin-marker";
      el.setAttribute("aria-label", "Selected location");
      el.style.cssText = "pointer-events:none;line-height:0";
      el.innerHTML = `
        <svg width="36" height="48" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.55))">
          <path d="M15 0 C23.284 0 30 6.716 30 15 C30 23.5 15 40 15 40 C15 40 0 23.5 0 15 C0 6.716 6.716 0 15 0 Z" style="fill:#10b981;stroke:white;stroke-width:2"/>
          <circle cx="15" cy="15" r="5" style="fill:white"/>
        </svg>
      `;
      markerRef.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([coord.lon, coord.lat])
        .addTo(map);
    }
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, [map, coord]);
  return null;
}

function TravelerLocationMarker({
  map,
  position,
  isPulsing,
}: {
  map: maplibregl.Map | null;
  position: { lat: number; lon: number } | null;
  isPulsing?: boolean;
}) {
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!position) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const markerClassName = isPulsing
      ? "traveler-location-marker traveler-location-marker--pulsing"
      : "traveler-location-marker";

    if (markerRef.current) {
      markerRef.current.setLngLat([position.lon, position.lat]);
      markerRef.current.getElement().className = markerClassName;
    } else {
      const el = document.createElement("div");
      el.className = markerClassName;

      const ring = document.createElement("div");
      ring.className = "traveler-location-ring";

      const dot = document.createElement("div");
      dot.className = "traveler-location-dot";

      el.appendChild(ring);
      el.appendChild(dot);

      markerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([position.lon, position.lat])
        .addTo(map);
    }

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, [map, position, isPulsing]);

  return null;
}

function TripReplayHud({
  playheadIndex,
  endIndex,
  currentPinKind,
  currentPinTime,
  speed,
  isPaused,
  onTogglePause,
  onRestart,
  onScrub,
  onSpeedChange,
  onShuttleStart,
  onShuttleEnd,
  onClose,
}: {
  playheadIndex: number;
  endIndex: number;
  currentPinKind: "checkpoint" | "breadcrumb" | "end";
  currentPinTime: number | null;
  speed: number;
  isPaused: boolean;
  onTogglePause: () => void;
  onRestart: () => void;
  onScrub: (index: number) => void;
  onSpeedChange: (speed: number) => void;
  onShuttleStart: () => void;
  onShuttleEnd: () => void;
  onClose: () => void;
}) {
  const progress = endIndex > 0 ? Math.round((playheadIndex / endIndex) * 100) : 0;
  const isEnd = currentPinKind === "end";
  const kindLabel = currentPinKind === "checkpoint" ? "Stop" : currentPinKind === "breadcrumb" ? "Breadcrumb" : "End";

  return (
    <motion.div
      key="trip-replay"
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 16, opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" as const }}
      className="pointer-events-auto absolute bottom-[88px] left-1/2 z-[21] w-[calc(100%-24px)] max-w-[390px] -translate-x-1/2 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-3 text-[var(--ink-1)] shadow-[var(--shadow-card)]"
      role="group"
      aria-label="Trip Replay"
      data-replay-hud=""
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-[var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Trip Replay · {kindLabel}
          </p>
          <p className="truncate text-xs font-semibold text-[var(--ink-1)]">
            {isEnd ? "End" : currentPinTime !== null ? formatReplayTime(currentPinTime) : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isEnd ? (
            <button
              type="button"
              onClick={onRestart}
              aria-label="Replay from start"
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--meter-track)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-1)] transition-colors hover:bg-[var(--bg-paper)]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Replay
            </button>
          ) : (
            <button
              type="button"
              onClick={onTogglePause}
              aria-label={isPaused ? "Play replay" : "Pause replay"}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--meter-track)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-1)] transition-colors hover:bg-[var(--bg-paper)]"
            >
              {isPaused ? (
                <>
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  Play
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  Pause
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trip replay"
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--meter-track)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-1)] transition-colors hover:bg-[var(--bg-paper)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Close
          </button>
        </div>
      </div>

      <label className="mt-3 grid gap-1.5">
        <span className="flex items-center justify-between font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
          <span>Timeline</span>
          <span>{progress}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={endIndex}
          step={1}
          value={Math.min(endIndex, Math.max(0, playheadIndex))}
          onChange={(event) => onScrub(Number(event.currentTarget.value))}
          className="h-2 w-full accent-[var(--flag)]"
          aria-label="Replay timeline"
        />
      </label>

      <label className="mt-3 grid gap-1.5">
        <span className="flex items-center justify-between font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
          <span>Shuttle</span>
          <span>{speed}x</span>
        </span>
        <input
          type="range"
          min={1}
          max={16}
          step={1}
          value={speed}
          onPointerDown={onShuttleStart}
          onPointerUp={onShuttleEnd}
          onChange={(event) => onSpeedChange(Number(event.currentTarget.value))}
          className="h-2 w-full accent-[var(--flag)]"
          aria-label="Replay speed"
        />
      </label>
    </motion.div>
  );
}

const CLOAKING_RADIUS_OPTIONS = [
  { value: 100, label: "100 m" },
  { value: 200, label: "200 m" },
  { value: 500, label: "500 m" },
  { value: 1000, label: "1 km" },
];

function CloakingPinSheet({
  pin,
  token,
  onClose,
  onDeleted,
}: {
  pin: CloakingPin;
  token: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [labelInput, setLabelInput] = useState(pin.label ?? "");
  const [radiusMeters, setRadiusMeters] = useState(pin.radiusMeters);
  const updatePin = useMutation(tripcastApi.cloakingPins.travelerUpdateCloakingPin);
  const deletePin = useMutation(tripcastApi.cloakingPins.travelerDeleteCloakingPin);

  const isDirty = labelInput !== (pin.label ?? "") || radiusMeters !== pin.radiusMeters;

  function handleSave() {
    updatePin({ token, pinId: pin._id, radiusMeters, label: labelInput.trim() || undefined })
      .then(onClose)
      .catch(() => {});
  }

  function handleDelete() {
    deletePin({ token, pinId: pin._id }).catch(() => {});
    onDeleted();
  }

  return (
    <div className="flex flex-col gap-5 px-4 pb-6 pt-4">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#6b7280] text-white shadow-sm">
          <EyeOff className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-[var(--font-display)] text-lg font-extrabold tracking-tight text-[var(--ink-1)]">
            Cloaking Zone
          </h2>
          <p className="text-xs text-[var(--ink-3)]">
            {pin.lat.toFixed(5)}, {pin.lon.toFixed(5)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[var(--ink-2)]">Label (optional)</label>
        <input
          type="text"
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          placeholder="e.g. Home, Hotel"
          maxLength={60}
          className="w-full rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper-2)] px-3 py-2 text-sm text-[var(--ink-1)] placeholder:text-[var(--ink-3)] focus:outline-none focus:ring-2 focus:ring-[#7a9cdc]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[var(--ink-2)]">Zone radius</label>
        <div className="flex gap-1.5">
          {CLOAKING_RADIUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                radiusMeters === opt.value
                  ? "border-[#7a9cdc] bg-[#7a9cdc] text-white"
                  : "border-[var(--line-soft)] bg-[var(--bg-paper-2)] text-[var(--ink-2)] hover:bg-[var(--bg-paper-3)]"
              }`}
              onClick={() => setRadiusMeters(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {isDirty && (
          <button
            className="w-full rounded-lg bg-[#7a9cdc] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            onClick={handleSave}
          >
            Save changes
          </button>
        )}
        <button
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4" />
          Delete zone
        </button>
      </div>
    </div>
  );
}

function ConvexCheckpointSheet({
  selectedCoordinate,
  token,
  onClose,
  prefill,
  onCheckpointCreated,
  onBack,
  debugSource,
}: {
  selectedCoordinate: SelectedCoordinate | null;
  token: string;
  onClose: () => void;
  prefill?: CheckpointPrefill;
  onCheckpointCreated?: (id: string, prefill?: CheckpointPrefill) => void;
  onBack?: () => void;
  debugSource?: DebugOpenSource;
}) {
  const log = useDebugLogger("ConvexCheckpointSheet", "src/features/map/TripMap.tsx");
  const addCheckpoint = useMutation(tripcastApi.checkpoints.addCheckpoint);
  const generateStoryImageUploadUrl = useMutation(tripcastApi.checkpoints.generateStoryImageUploadUrl);
  const completeMissionAsStory = useMutation(
    tripcastApi.missions.travelerCompleteMissionAsStory,
  );
  const updateTransaction = useMutation(tripcastApi.travelFunds.travelerUpdateTransaction);
  const isFromMission = Boolean(prefill?.missionId);
  const badgeDefinitions = useQuery(
    tripcastApi.badges.listBadgeDefinitions,
    isFromMission ? { token } : "skip",
  );

  const [stateOpen, setStateOpen] = useState(false);
  const [awardBadgeType, setAwardBadgeType] = useState<BadgeType | null>(null);
  // Pre-creation staging: transactions picked or newly-created via the
  // TransactionPickerSheet, linked to the new checkpoint after save. Cleared
  // when the sheet closes.
  const [stagedTransactions, setStagedTransactions] = useState<Transaction[]>([]);
  const [moodValue, setMoodValue] = useState<import("../../convex/tripcastApi").TravelerMoodValue | undefined>();
  const [energyLevel, setEnergyLevel] = useState<import("../../convex/tripcastApi").TravelerEnergyLevel | undefined>();
  const [stomachLevel, setStomachLevel] = useState<import("../../convex/tripcastApi").TravelerStomachLevel | undefined>();
  const [stressLevel, setStressLevel] = useState<import("../../convex/tripcastApi").TravelerStressLevel | undefined>();
  const [scheduleLevel, setScheduleLevel] = useState<import("../../convex/tripcastApi").TravelerSchedulePressureLevel | undefined>();
  const [quickNote, setQuickNote] = useState("");

  // Reset state fields when the sheet closes
  useEffect(() => {
    if (!selectedCoordinate) {
      setStateOpen(false);
      setMoodValue(undefined);
      setEnergyLevel(undefined);
      setStomachLevel(undefined);
      setStressLevel(undefined);
      setScheduleLevel(undefined);
      setQuickNote("");
      setAwardBadgeType(null);
      setStagedTransactions([]);
    }
  }, [selectedCoordinate]);

  async function handleSave(args: Omit<AddCheckpointArgs, "token">): Promise<string> {
    let checkpointId: string;
    if (prefill?.missionId && prefill.completeMission !== false) {
      if (args.lat === undefined || args.lon === undefined) {
        throw new Error("A map location is required to complete as story.");
      }
      checkpointId = await completeMissionAsStory({
        token,
        missionId: prefill.missionId,
        title: args.title,
        note: args.note,
        locationLabel: args.locationLabel,
        lat: args.lat,
        lon: args.lon,
        source: args.source,
        imageId: args.imageId,
        awardBadgeType: awardBadgeType ?? undefined,
      });
    } else {
      checkpointId = await addCheckpoint({
        ...args,
        token,
        moodValue,
        energyLevel,
        energyScore: energyLevel ? ENERGY_SCORE_FOR_LEVEL[energyLevel] : undefined,
        stomachLevel,
        stomachScore: stomachLevel ? STOMACH_SCORE_FOR_LEVEL[stomachLevel] : undefined,
        stressLevel,
        stressScore: stressLevel ? STRESS_SCORE_FOR_LEVEL[stressLevel] : undefined,
        schedulePressureLevel: scheduleLevel,
        statusNote: quickNote.trim() || undefined,
        imageId: args.imageId,
      });
    }
    // Link each staged transaction to the new checkpoint. Per-tx try/catch so
    // one failure doesn't strand the rest — the checkpoint exists either way.
    for (const tx of stagedTransactions) {
      try {
        await updateTransaction({
          token,
          transactionId: tx._id,
          linkedCheckpointId: checkpointId,
        });
        log.logFunds("transaction:link-after-save", {
          transactionId: tx._id,
          checkpointId,
        });
      } catch (linkError) {
        log.error("transaction:link-after-save:error", "funds", {
          transactionId: tx._id,
          message: linkError instanceof Error ? linkError.message : String(linkError),
        });
      }
    }
    return checkpointId;
  }

  function Chips<T extends string>({ values, labels, selected, onSelect }: { values: T[]; labels: Record<T, string>; selected: T | undefined; onSelect: (v: T) => void }) {
    return (
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onSelect(v)}
            className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${selected === v ? "bg-[var(--flag)] text-[var(--ink-on-brand)]" : "bg-[var(--bg-card)] text-[var(--ink-3)] hover:bg-[var(--meter-track)]"}`}
          >
            {labels[v]}
          </button>
        ))}
      </div>
    );
  }

  const stateSection = (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => setStateOpen((p) => !p)}
        className="flex items-center gap-1 text-xs font-semibold text-[var(--ink-3)] hover:text-[var(--ink-1)]"
      >
        <span>{stateOpen ? "▾" : "▸"}</span> Also update Traveler State
      </button>
      {stateOpen && (
        <div className="grid gap-3 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 text-sm">
          <div className="grid gap-1">
            <span className="text-xs text-[var(--ink-3)]">Mood</span>
            <Chips values={MOOD_VALUES} labels={MOOD_LABELS} selected={moodValue} onSelect={setMoodValue} />
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-[var(--ink-3)]">Energy</span>
            <Chips values={ENERGY_VALUES} labels={ENERGY_LABELS} selected={energyLevel} onSelect={setEnergyLevel} />
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-[var(--ink-3)]">Stomach</span>
            <Chips values={STOMACH_VALUES} labels={STOMACH_LABELS} selected={stomachLevel} onSelect={setStomachLevel} />
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-[var(--ink-3)]">Stress</span>
            <Chips values={STRESS_VALUES} labels={STRESS_LABELS} selected={stressLevel} onSelect={setStressLevel} />
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-[var(--ink-3)]">Schedule</span>
            <Chips values={SCHEDULE_VALUES} labels={SCHEDULE_LABELS} selected={scheduleLevel} onSelect={setScheduleLevel} />
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-[var(--ink-3)]">Note</span>
            <textarea
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value.slice(0, 240))}
              rows={2}
              placeholder="How are you doing?"
              className="resize-none rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--ink-1)] outline-none placeholder:text-[var(--ink-3)] focus:border-[var(--flag)] focus:ring-1 focus:ring-[var(--flag)]"
            />
            <span className="text-right text-xs text-[var(--ink-3)]">{quickNote.length}/240</span>
          </div>
        </div>
      )}
      {isFromMission && (
        <div className="grid gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 text-sm">
          <span className="text-xs font-semibold text-[var(--ink-3)]">
            Award a badge to the creator?{" "}
            <span className="font-normal">(optional)</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setAwardBadgeType(null)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                awardBadgeType === null
                  ? "bg-[var(--flag)] text-[var(--ink-on-brand)]"
                  : "bg-[var(--bg-card)] text-[var(--ink-3)] hover:bg-[var(--meter-track)]"
              }`}
            >
              None
            </button>
            {(badgeDefinitions ?? []).map((b) => (
              <button
                key={b.badgeType}
                type="button"
                onClick={() => {
                  setAwardBadgeType(b.badgeType);
                  log.logInteraction("badge:complete-as-story:select", {
                    badgeType: b.badgeType,
                  });
                }}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  awardBadgeType === b.badgeType
                    ? "bg-[var(--flag)] text-[var(--ink-on-brand)]"
                    : "bg-[var(--bg-card)] text-[var(--ink-3)] hover:bg-[var(--meter-track)]"
                }`}
              >
                <span aria-hidden>{b.emoji}</span> {b.name}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[var(--ink-3)]">
            The badge is awarded to the Follower(s) credited on this Mission.
          </p>
        </div>
      )}
      <LinkedTransactionsSection
        token={token}
        mode="staging"
        staged={stagedTransactions}
        onStagedChange={setStagedTransactions}
      />
    </div>
  );

  return (
    <AddCheckpointSheet
      selectedCoordinate={selectedCoordinate}
      onClose={onClose}
      onSave={handleSave}
      stateSection={stateSection}
      prefill={prefill}
      onCheckpointCreated={onCheckpointCreated}
      onBack={onBack}
      onUploadImage={(file) => uploadStoryImage(file, () => generateStoryImageUploadUrl({ token }))}
      debugSource={debugSource}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type LastSentLocation = { lat: number; lon: number; sentAt: number } | null;
type LastLiveTrailSample = { lat: number; lon: number; sentAt: number } | null;
type SelectedStoryDetail = {
  eventId: string;
  checkpointId?: string;
  fallbackEvent: JournalEvent;
};

type StoryNavigationDirection = "previous" | "next";

type TripMapProps = {
  token: string;
  role: Role;
  locationResetNonce?: number;
  tripDataResetNonce?: number;
  finaleReplayActive?: boolean;
  onOpenDebugPanel?: () => void;
  onMapLoaded?: () => void;
  /** Fires when the crosshair location picker enters or exits. Used by App to
   * hide the TopBar / TripTicker so they don't overlap the helper banner. */
  onPickerActiveChange?: (active: boolean) => void;
};

export default function TripMap({
  token,
  role,
  locationResetNonce = 0,
  tripDataResetNonce = 0,
  finaleReplayActive = false,
  onOpenDebugPanel,
  onMapLoaded,
  onPickerActiveChange,
}: TripMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const activeMapStyleUrlRef = useRef<string | null>(null);
  const latestMapStyleUrlRef = useRef<string | null>(null);
  const placementModeRef = useRef(false);
  const browserLocationWatchRef = useRef<number | null>(null);
  const isLocationSharingRef = useRef(false);
  const liveTrailEnabledRef = useRef(false);
  const liveTrailCanRecordRef = useRef(false);
  const liveTrailPermissionLoggedRef = useRef(false);
  const locationDeniedPromptedRef = useRef(false);
  const locationDeniedSettingsOpenedRef = useRef(false);
  const lastLocationFixAtRef = useRef<number | null>(null);
  const [locationStale, setLocationStale] = useState(false);
  const lastSentLocationRef = useRef<LastSentLocation>(null);
  const lastLiveTrailSampleRef = useRef<LastLiveTrailSample>(null);
  const livePositionRef = useRef<{ lat: number; lon: number } | null>(null);
  const coordinatePickModeRef = useRef<CoordinatePickMode | null>(null);
  const mapServiceUnavailableRef = useRef(false);
  const mapCooldownTriggeredRef = useRef(false);
  const mapDiagnosticFetchUrlRef = useRef<string | null>(null);
  const mapFailureStatsRef = useRef(createMapFailureStats());
  const mapLoadedRef = useRef(false);
  // Ref-pattern for onMapLoaded: the map-init effect must NOT re-run when the
  // parent passes a fresh callback identity (would tear down + rebuild the
  // entire MapLibre instance). We capture the latest callback here so the
  // `map.on("load", ...)` handler always invokes the freshest version.
  const onMapLoadedRef = useRef(onMapLoaded);
  onMapLoadedRef.current = onMapLoaded;
  const mapInteractionsFrozenRef = useRef(false);
  const snappedReplayEventRef = useRef<string | null>(null);
  const finaleReplayStartedRef = useRef(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloakingPinsRef = useRef<CloakingPin[]>([]);
  const insideCloakingZoneRef = useRef(false);
  const enteredCloakAtRef = useRef<number | null>(null);
  const cloakToastShownRef = useRef(false);
  const cloakAutoShutoffFiredRef = useRef(false);
  const cardsWrapperRef = useRef<HTMLDivElement>(null);
  // Focus-observability: pendingFocusRef carries the in-flight focus so the next
  // programmatic moveend can log where the pin actually settled; focusAdjustArmRef
  // is the short window where a user pan is interpreted as "teach me the spot."
  const pendingFocusRef = useRef<FocusEntry | null>(null);
  const focusAdjustArmRef = useRef<(FocusEntry & { until: number }) | null>(null);
  // The currently focused pin + which sheet occludes it. A ResizeObserver on that
  // sheet recenters as it animates in (and on list<->detail height changes), so the
  // pin lands centered even though the sheet is not at final height when focus fires.
  const activeFocusRef = useRef<ActiveFocus | null>(null);
  const sheetResizeObserverRef = useRef<ResizeObserver | null>(null);
  const sheetResizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRecenterHeightRef = useRef<number>(-1);
  const music = useMusicSafe();
  const musicRef = useRef(music);
  const convex = useConvex();
  const log = useDebugLogger("TripMap", "src/features/map/TripMap.tsx");
  const calibration = useCenteringCalibration();
  // The moveend listener runs inside a mount-time closure, so mirror calibration
  // into a ref it can read at fire time.
  const calibrationRef = useRef(calibration);
  calibrationRef.current = calibration;

  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [selectedCoordinate, setSelectedCoordinate] = useState<SelectedCoordinate | null>(null);
  const [isPlacementMode, setIsPlacementMode] = useState(false);
  const [isVotePanelOpen, setIsVotePanelOpen] = useState(false);
  const [isTravelerStateOpen, setIsTravelerStateOpen] = useState(false);
  const [voteMapOverlay, setVoteMapOverlay] = useState<RouteVoteMapOverlayType | null>(null);
  const [voteOptionNumberById, setVoteOptionNumberById] = useState<Record<string, number> | null>(null);
  const [isLocationSharing, setIsLocationSharing] = useState(false);
  const [livePosition, setLivePosition] = useState<{ lat: number; lon: number; accuracy?: number } | null>(null);
  const [coordinatePickMode, setCoordinatePickMode] = useState<CoordinatePickMode | null>(null);
  // Live center of the map while the crosshair picker is active. Updated on
  // map "move" events so the helper banner reflects the candidate coordinate.
  const [pickCenter, setPickCenter] = useState<{ lat: number; lon: number } | null>(null);
  // Preview pin shown after a coordinate is confirmed but before the form
  // saves it (so the user can see where their selection landed while filling
  // out the rest of the form). Cleared when the picker re-opens (Change) or
  // the originating sheet closes.
  const [previewCoord, setPreviewCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"default" | "mystery">("default");
  const [debugShowAllMysteryPins, setDebugShowAllMysteryPins] = useState(() => {
    try {
      return localStorage.getItem("tripcast.mystery.showAllPinsDebug") === "true";
    } catch {
      return false;
    }
  });
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [selectedStoryDetail, setSelectedStoryDetail] = useState<SelectedStoryDetail | null>(null);
  const [storyOpenedFromJournal, setStoryOpenedFromJournal] = useState(false);
  const [isMessagingOpen, setIsMessagingOpen] = useState(false);
  const [isTravelFundsSheetOpen, setIsTravelFundsSheetOpen] = useState(false);
  const [selectedCloakingPin, setSelectedCloakingPin] = useState<CloakingPin | null>(null);
  const [isAchievementsOpen, setIsAchievementsOpen] = useState(false);
  const [isMissionsPanelOpen, setIsMissionsPanelOpen] = useState(false);
  const [isMissionDetailOpen, setIsMissionDetailOpen] = useState(false);
  const [journalDebugSource, setJournalDebugSource] = useState<DebugOpenSource>(UNKNOWN_DEBUG_SOURCE);
  const [mapCooldownState, setMapCooldownState] = useState<MapCooldownState>(() => readMapCooldownState());
  // Basemap style fetch failure (e.g. a 404 from a misconfigured proxy host).
  // Distinct from the 403/429 cooldown path, which would otherwise leave the
  // basemap blank with no on-screen signal. Cleared on a successful map load.
  const [mapStyleError, setMapStyleError] = useState<{ status?: number } | null>(null);
  const [mapErrorDismissed, setMapErrorDismissed] = useState(false);
  const [mapInitRetryToken, setMapInitRetryToken] = useState(0);
  const [missionsDebugSource, setMissionsDebugSource] = useState<DebugOpenSource>(UNKNOWN_DEBUG_SOURCE);
  const [votesDebugSource, setVotesDebugSource] = useState<DebugOpenSource>(UNKNOWN_DEBUG_SOURCE);
  const [fundsDebugSource, setFundsDebugSource] = useState<DebugOpenSource>(UNKNOWN_DEBUG_SOURCE);
  const [stateDebugSource, setStateDebugSource] = useState<DebugOpenSource>(UNKNOWN_DEBUG_SOURCE);
  const [storyDebugSource, setStoryDebugSource] = useState<DebugOpenSource>(UNKNOWN_DEBUG_SOURCE);
  const [checkInDebugSource, setCheckInDebugSource] = useState<DebugOpenSource>(UNKNOWN_DEBUG_SOURCE);
  const [pendingOpenMissionId, setPendingOpenMissionId] = useState<string | null>(null);
  const [pendingOpenMysteryMissionId, setPendingOpenMysteryMissionId] = useState<string | null>(null);
  const [missionPrefillCoordinate, setMissionPrefillCoordinate] = useState<{ lat: number; lon: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lat: number; lon: number } | null>(null);
  // Mission Complete-as-Story flow: when the Traveler picks the "Complete as story"
  // branch in a mission detail, this prefill seeds AddCheckpointSheet with the
  // mission's title/location and carries the missionId through so we can call
  // `travelerCompleteMission` after the resulting story lands.
  const [storyPrefill, setStoryPrefill] = useState<CheckpointPrefill | null>(null);
  // Set alongside `storyPrefill` so hitting "← Back" inside the story sheet
  // can reopen MissionsPanel directly on the originating mission's detail
  // view (the four-button action set the Traveler expects to return to).
  const [pendingOpenDetailMissionId, setPendingOpenDetailMissionId] = useState<string | null>(null);
  const [pendingOpenVoteId, setPendingOpenVoteId] = useState<string | null>(null);
  const [replayActive, setReplayActive] = useState(false);
  const [replayPlayheadIndex, setReplayPlayheadIndex] = useState<number | null>(null);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [replayPaused, setReplayPaused] = useState(false);
  const [replayTrailSamples, setReplayTrailSamples] = useState<LiveTrailSample[] | null>(null);
  const [replayTrailLoad, setReplayTrailLoad] = useState<{
    status: "idle" | "loading" | "loaded" | "error";
    pages: number;
    samples: number;
    durationMs?: number;
    error?: string;
  }>({ status: "idle", pages: 0, samples: 0 });
  const replayTrailLoadSeqRef = useRef(0);
  const stopFollowing = useCallback(() => {
    setIsFollowing(false);
  }, []);
  const canWrite = role === "traveler";
  const { resolvedMapBase, resolvedTheme } = useTheme();
  const routeLineColor = resolvedTheme === "constellation" ? "#ffd86a" : "#444444";
  const gpsPulseColor = resolvedTheme === "constellation" ? "#ffb84a" : "#7a9cdc";
  const sheetPersonalities = useSheetPersonalities();
  const FUNDS_PERSONALITY = sheetPersonalities.funds;
  const mapStyleResolution = useMemo(() => getMapStyleResolution(resolvedMapBase), [resolvedMapBase]);
  const mapStyleUrl = mapStyleResolution.styleUrl;
  latestMapStyleUrlRef.current = mapStyleUrl;
  const mapProxyConfigHint = useMemo(() => getMapProxyConfigHint(mapStyleResolution), [mapStyleResolution]);
  const mapCooldownUntil = mapCooldownState.until;
  const isMapServiceUnavailable = mapCooldownUntil !== null || !mapStyleUrl;

  const updateTravelerLocation = useMutation(tripcastApi.travelerLocations.updateTravelerLocation);
  const stopTravelerLocationSharing = useMutation(
    tripcastApi.travelerLocations.stopTravelerLocationSharing,
  );
  const recordLiveTrailSample = useMutation(tripcastApi.liveTrail.travelerRecordLiveTrailSample);
  const applyMovementDetection = useMutation(tripcastApi.currentActivity.travelerApplyMovementDetection);
  const movementPrefs = useQuery(
    tripcastApi.travelerPreferences.travelerGetPreferences,
    role === "traveler" ? { token } : "skip",
  );
  const movementPrefsRef = useRef<typeof movementPrefs>(undefined);
  movementPrefsRef.current = movementPrefs;
  const movementDebugRecords = useMovementDebugRecords();
  const movementDebugSpeed = useMovementDebugSpeed();
  const movementDebugRef = useRef({ records: movementDebugRecords, speed: movementDebugSpeed });
  movementDebugRef.current = { records: movementDebugRecords, speed: movementDebugSpeed };
  const addCloakingPin = useMutation(tripcastApi.cloakingPins.travelerAddCloakingPin);
  const cloakingPinsData = useQuery(
    tripcastApi.cloakingPins.travelerListCloakingPins,
    role === "traveler" ? { token } : "skip",
  );
  const rawCheckpoints = useQuery(tripcastApi.checkpoints.listCheckpoints, { token });
  const cutoffPreview = useFollowerCutoffPreview(role, token);
  const checkpoints = useMemo(() => {
    const all = rawCheckpoints ?? [];
    return cutoffPreview.cutoffAt
      ? all.filter((cp) => (cp.happenedAt ?? cp.createdAt) >= (cutoffPreview.cutoffAt as number))
      : all;
  }, [rawCheckpoints, cutoffPreview.cutoffAt]);
  const storedTravelerLocation = useQuery(tripcastApi.travelerLocations.getTravelerLocation, {
    token,
  });
  const travelerLiveTrailStatus = useQuery(
    tripcastApi.liveTrail.travelerGetLiveTrailStatus,
    role === "traveler" ? { token } : "skip",
  );
  const followerLiveTrail = useQuery(
    tripcastApi.liveTrail.followerListLiveTrailSamples,
    role === "follower" ? { token } : "skip",
  );
  const liveTrailEnabled = role === "traveler" && travelerLiveTrailStatus?.enabled === true;
  const followerPreferences = useQuery(
    tripcastApi.travelerPreferences.followerGetPreferences,
    role === "follower" ? { token } : "skip",
  );

  const travelerAllowsFollowerPath = followerPreferences?.visible
    ? (followerPreferences.allowFollowersTripPath ?? false)
    : false;

  const liveTrailSamples = useMemo(() => {
    const all =
      role === "traveler"
        ? (travelerLiveTrailStatus?.samples ?? [])
        : (followerLiveTrail?.visible ? followerLiveTrail.samples : []);
    return cutoffPreview.cutoffAt
      ? all.filter((s) => s.sampledAt >= (cutoffPreview.cutoffAt as number))
      : all;
  }, [role, travelerLiveTrailStatus, followerLiveTrail, cutoffPreview.cutoffAt]);
  const liveTrailPathVisible = liveTrailSamples.length >= 1;
  const replaySourceTrailSamples = replayTrailSamples ?? liveTrailSamples;
  const pathTrailSamples = replayActive && replayTrailSamples ? replayTrailSamples : liveTrailSamples;
  const pathTrailVisible = pathTrailSamples.length >= 1;

  const [showTripPathLocal, setShowTripPathLocal] = useState(() => {
    const val = localStorage.getItem("tripcast.showTripPath");
    return val === null ? true : val === "true";
  });

  useEffect(() => {
    const handler = () => {
      const val = localStorage.getItem("tripcast.showTripPath");
      setShowTripPathLocal(val === null ? true : val === "true");
    };
    window.addEventListener("tripcast.preferencesUpdated", handler);
    return () => window.removeEventListener("tripcast.preferencesUpdated", handler);
  }, []);

  const showPath = role === "traveler"
    ? showTripPathLocal
    : travelerAllowsFollowerPath && showTripPathLocal;
  const replayTrailLoading = replayTrailLoad.status === "loading";
  const canAttemptReplay = showPath && !replayTrailLoading;

  useEffect(() => {
    replayTrailLoadSeqRef.current += 1;
    setReplayTrailSamples(null);
    setReplayTrailLoad({ status: "idle", pages: 0, samples: 0 });
  }, [token, role, cutoffPreview.cutoffAt]);

  const handleCloakingPinClick = useCallback(
    (pin: CloakingPin) => {
      music.sfx("tap");
      stopFollowing();
      setSelectedCloakingPin(pin);
      mapInstance?.easeTo({ center: [pin.lon, pin.lat], duration: 500 });
    },
    [music, mapInstance, stopFollowing],
  );

  useCloakingZones(
    mapInstance,
    role === "traveler" ? (cloakingPinsData ?? []) : [],
    handleCloakingPinClick,
  );

  useEffect(() => {
    logMapEvent("map:trip-path:gating", {
      role,
      showTripPathLocal,
      travelerAllowsFollowerPath,
      showPath,
    });
  }, [role, showTripPathLocal, travelerAllowsFollowerPath, showPath]);

  const sessionData = useQuery(tripcastApi.auth.currentSession, { token });
  const followerSession = useQuery(tripcastApi.followers.followerCurrentSession, { token });
  const currentUserId = sessionData?.userId || followerSession?.userId;
  const currentSessionId = sessionData?.sessionId || followerSession?.sessionId;

  const queriedJournalEvents = useQuery(tripcastApi.journalEvents.listJournalEvents, { token });
  const journalEvents = useMemo(() => {
    const all = queriedJournalEvents ?? [];
    return cutoffPreview.cutoffAt
      ? all.filter((e) => e.occurredAt >= (cutoffPreview.cutoffAt as number))
      : all;
  }, [queriedJournalEvents, cutoffPreview.cutoffAt]);
  const replayJournalEvents = useMemo(
    () => (role === "traveler" ? (queriedJournalEvents ?? []) : journalEvents),
    [journalEvents, queriedJournalEvents, role],
  );
  const loadReplayTrailSamples = useCallback(async () => {
    if (replayTrailSamples) return replayTrailSamples;
    const seq = ++replayTrailLoadSeqRef.current;
    const startedAt = performance.now();
    const cutoffAt = role === "follower" ? (cutoffPreview.cutoffAt ?? undefined) : undefined;
    let cursor: string | null = null;
    let pages = 0;
    const samples: LiveTrailSample[] = [];
    setReplayTrailLoad({ status: "loading", pages: 0, samples: 0 });
    log.logInteraction("live-trail:replay-fetch:start", { role, cutoffApplied: cutoffAt ?? null });

    try {
      for (;;) {
        const page: LiveTrailReplayPage = await convex.query(tripcastApi.liveTrail.listReplayLiveTrailSamples, {
          token,
          cutoffAt,
          paginationOpts: {
            numItems: REPLAY_TRAIL_PAGE_SIZE,
            cursor,
            maximumRowsRead: REPLAY_TRAIL_PAGE_SIZE * 2,
            maximumBytesRead: 256_000,
          },
        });
        pages += 1;
        samples.push(...page.page);
        const durationMs = Math.round(performance.now() - startedAt);
        log.logInteraction("live-trail:replay-fetch:page", {
          role,
          page: pages,
          pageSamples: page.page.length,
          samples: samples.length,
          durationMs,
        });
        if (seq === replayTrailLoadSeqRef.current) {
          setReplayTrailLoad({ status: "loading", pages, samples: samples.length, durationMs });
        }
        if (page.isDone) break;
        cursor = page.continueCursor;
      }

      const durationMs = Math.round(performance.now() - startedAt);
      const estimatedPayloadBytes = samples.length * REPLAY_TRAIL_ESTIMATED_BYTES_PER_SAMPLE;
      log.logInteraction("live-trail:replay-fetch:complete", {
        role,
        pages,
        samples: samples.length,
        durationMs,
        estimatedPayloadBytes,
        cutoffApplied: cutoffAt ?? null,
        firstSampleTs: samples[0]?.sampledAt ?? null,
        lastSampleTs: samples.at(-1)?.sampledAt ?? null,
      });
      if (seq === replayTrailLoadSeqRef.current) {
        setReplayTrailSamples(samples);
        setReplayTrailLoad({ status: "loaded", pages, samples: samples.length, durationMs });
      }
      return samples;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Math.round(performance.now() - startedAt);
      log.error("live-trail:replay-fetch:error", "query", { role, pages, samples: samples.length, durationMs, message });
      if (seq === replayTrailLoadSeqRef.current) {
        setReplayTrailLoad({ status: "error", pages, samples: samples.length, durationMs, error: message });
      }
      throw error;
    }
  }, [convex, cutoffPreview.cutoffAt, log, replayTrailSamples, role, token]);
  const replayPins = useMemo<ReplayPin[]>(
    () => buildReplayPins(replayJournalEvents, replaySourceTrailSamples),
    [replayJournalEvents, replaySourceTrailSamples],
  );
  const replayEndIndex = replayPins.length;
  const canReplayTrip = replayPins.length > 1;
  // Categorize the current beat. End = synthetic terminal beat at index === length.
  const currentReplayPin = replayPlayheadIndex !== null && replayPlayheadIndex < replayPins.length
    ? replayPins[replayPlayheadIndex]
    : null;
  const currentReplayPinKind: "checkpoint" | "breadcrumb" = currentReplayPin?.kind ?? "checkpoint";
  // Reveal-to timestamp = next checkpoint at-or-after current index (so the trail
  // extends ahead to the next stop on breadcrumb beats, no further).
  const replayRevealUpTo = useMemo(() => {
    if (!replayActive || replayPlayheadIndex === null) return null;
    if (replayPlayheadIndex >= replayPins.length) return Number.POSITIVE_INFINITY;
    // Start strictly AFTER the current index so a checkpoint beat extends the trail
    // forward to the next checkpoint (the segment the camera is about to traverse),
    // not just up to the pin under the cursor.
    for (let i = replayPlayheadIndex + 1; i < replayPins.length; i += 1) {
      const pin = replayPins[i];
      if (pin.kind === "checkpoint") return pin.occurredAt;
    }
    return replayPins[replayPins.length - 1]?.occurredAt ?? null;
  }, [replayActive, replayPlayheadIndex, replayPins]);

  useTripPath(
    mapInstance,
    checkpoints,
    role === "traveler"
      ? (isLocationSharing ? livePosition : null)
      : (storedTravelerLocation ? { lat: storedTravelerLocation.lat, lon: storedTravelerLocation.lon } : null),
    showPath,
    replayRevealUpTo,
    routeLineColor,
    pathTrailSamples,
    pathTrailVisible,
  );

  const { unreadCount, markAllRead } = useJournalUnread(journalEvents);

  const messages = useQuery(tripcastApi.messages.listMessages, { token }) ?? [];
  const { unreadCount: messagingUnread, markAllRead: markMessagingRead, lastReadAt } = 
    useMessagingUnread(messages, currentUserId, role, currentSessionId);
  const visibleMessagingUnread = isMessagingOpen ? 0 : messagingUnread;

  const allMissionsForBadge = useQuery(
    tripcastApi.missions.travelerListMissions,
    role === "traveler" ? { token } : "skip",
  );
  const followerMissions = useQuery(
    tripcastApi.missions.followerListMissions,
    role === "follower" ? { token } : "skip",
  );
  const missionBadgeCount =
    role === "traveler"
      ? (allMissionsForBadge ?? []).filter((c) => c.status === "proposed").length
      : 0;
  const missionsForLookup = role === "traveler" ? allMissionsForBadge : followerMissions;
  const selectedStoryEvent = useMemo(() => {
    if (!selectedStoryDetail) return null;
    const freshEvent = journalEvents.find((event) => event._id === selectedStoryDetail.eventId)
      ?? (
        selectedStoryDetail.checkpointId
          ? journalEvents.find((event) => event.checkpointId === selectedStoryDetail.checkpointId)
          : undefined
      );
    if (freshEvent) return freshEvent;
    return queriedJournalEvents === undefined ? selectedStoryDetail.fallbackEvent : null;
  }, [journalEvents, queriedJournalEvents, selectedStoryDetail]);
  const storyNavigation = useMemo(() => {
    if (!selectedStoryEvent || selectedStoryEvent.type !== "story") return null;
    const chronologicalStories = journalEvents
      .filter((event) => event.type === "story")
      .slice()
      .sort((a, b) => {
        const occurredDelta = a.occurredAt - b.occurredAt;
        if (occurredDelta !== 0) return occurredDelta;
        return a._creationTime - b._creationTime;
      });
    const currentIndex = chronologicalStories.findIndex((event) =>
      event._id === selectedStoryEvent._id ||
      (event.checkpointId !== undefined && event.checkpointId === selectedStoryEvent.checkpointId)
    );
    if (currentIndex < 0) return null;
    return {
      events: chronologicalStories,
      currentIndex,
      total: chronologicalStories.length,
      hasPrevious: currentIndex > 0,
      hasNext: currentIndex < chronologicalStories.length - 1,
    };
  }, [journalEvents, selectedStoryEvent]);

  const voteAlert = useQuery(tripcastApi.routeVotes.getActiveRouteVoteAlert, { token });
  const hasUnseenVote = voteAlert?.hasUnseen ?? false;

  const [fanOpen, setFanOpen] = useState(false);
  const isDesktop = useIsDesktop();

  // Re-measure the map canvas when the desktop/mobile layout switches so
  // MapLibre doesn't show a blank canvas after the container changes size.
  useEffect(() => {
    if (!mapRef.current) return;
    const id = requestAnimationFrame(() => { mapRef.current?.resize(); });
    return () => cancelAnimationFrame(id);
  }, [isDesktop]);

  useTripAudioScenario({
    storyOpen: selectedStoryDetail !== null || storyPrefill !== null,
    missionDetailOpen: isMissionDetailOpen,
    achievementsOpen: isAchievementsOpen,
    voteSheetOpen: isVotePanelOpen,
  });

  useEffect(() => {
    musicRef.current = music;
  }, [music]);

  useEffect(() => {
    function syncDebugPins(event?: Event) {
      const custom = event as CustomEvent<{ enabled?: boolean }>;
      if (custom.detail && typeof custom.detail.enabled === "boolean") {
        setDebugShowAllMysteryPins(custom.detail.enabled);
        return;
      }
      try {
        setDebugShowAllMysteryPins(localStorage.getItem("tripcast.mystery.showAllPinsDebug") === "true");
      } catch {
        setDebugShowAllMysteryPins(false);
      }
    }
    window.addEventListener("tripcast:mystery-debug-pins", syncDebugPins);
    window.addEventListener("storage", syncDebugPins);
    return () => {
      window.removeEventListener("tripcast:mystery-debug-pins", syncDebugPins);
      window.removeEventListener("storage", syncDebugPins);
    };
  }, []);

  const showToast = useCallback((message: string, variant: "default" | "mystery" = "default") => {
    musicRef.current.sfx("toast");
    if (toastTimeoutRef.current !== null) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastVariant(variant);
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      setToastVariant("default");
      toastTimeoutRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => {
    if (!replayActive || replayPlayheadIndex === null || replayPaused) return;
    if (replayPlayheadIndex >= replayEndIndex) return;

    // Variable beat: breadcrumb beats tick at 2x (half the duration); checkpoint
    // beats use the base duration. Both scale by replaySpeed.
    const pin = replayPlayheadIndex < replayPins.length ? replayPins[replayPlayheadIndex] : null;
    const kindMultiplier = pin?.kind === "breadcrumb" ? 0.5 : 1;
    const beatMs = Math.max(60, Math.round((REPLAY_BASE_BEAT_MS * kindMultiplier) / replaySpeed));
    const timeout = window.setTimeout(() => {
      setReplayPlayheadIndex((current) => {
        if (current === null) return current;
        return Math.min(replayEndIndex, current + 1);
      });
    }, beatMs);
    return () => window.clearTimeout(timeout);
  }, [replayActive, replayPlayheadIndex, replayEndIndex, replayPins, replaySpeed, replayPaused]);

  useEffect(() => {
    if (!replayActive || replayPlayheadIndex === null || replayPins.length === 0) return;
    const map = mapRef.current;

    // End beat: fit the entire route in view.
    if (replayPlayheadIndex >= replayPins.length) {
      const endKey = "__end__";
      if (snappedReplayEventRef.current === endKey) return;
      snappedReplayEventRef.current = endKey;
      if (!map || mapServiceUnavailableRef.current) {
        log.logInteraction("replay:coordinate-snap:blocked", {
          eventId: endKey,
          reason: map ? "map-service-unavailable" : "map-unavailable",
        });
        return;
      }
      let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
      for (const pin of replayPins) {
        if (pin.lat < minLat) minLat = pin.lat;
        if (pin.lat > maxLat) maxLat = pin.lat;
        if (pin.lon < minLon) minLon = pin.lon;
        if (pin.lon > maxLon) maxLon = pin.lon;
      }
      log.logInteraction("replay:fit-end", { total: replayPins.length });
      log.logMap("map:camera:focus", {
        trigger: "replay:fit-end",
        minLat, maxLat, minLon, maxLon,
      });
      pendingFocusRef.current = null;
      focusAdjustArmRef.current = null;
      // The TripReplayHud is the bottom occluder during replay; treat it like a
      // sheet so fitBounds keeps the route above it.
      const padding = readOccluderPadding(map, {
        topOccluderEl: cardsWrapperRef.current,
        sheetSelector: "[data-replay-hud]",
      });
      map.fitBounds(
        [[minLon, minLat], [maxLon, maxLat]],
        { padding, duration: 800, maxZoom: 14 },
      );
      return;
    }

    const target = replayPins[replayPlayheadIndex];
    if (!target) return;
    const snapKey = `${replayPlayheadIndex}:${target.eventId}`;
    if (snappedReplayEventRef.current === snapKey) return;
    snappedReplayEventRef.current = snapKey;

    // Persist the resume point on every successful pin transition (not End).
    writeReplayResume(token, { eventId: target.eventId, index: replayPlayheadIndex });

    if (!map || mapServiceUnavailableRef.current) {
      log.logInteraction("replay:coordinate-snap:blocked", {
        eventId: target.eventId,
        reason: map ? "map-service-unavailable" : "map-unavailable",
      });
      return;
    }

    log.logInteraction("replay:coordinate-snap", {
      eventId: target.eventId,
      index: replayPlayheadIndex,
      total: replayPins.length,
      kind: target.kind,
      lat: roundedCoordinate(target.lat),
      lon: roundedCoordinate(target.lon),
    });
    // Geometry-driven focus (no bottom sheet during replay). Mirrors
    // focusCoordinate() so the observability triad still fires; defined inline
    // because that closure is declared later in the component body.
    const coord = { lat: target.lat, lon: target.lon };
    const geometry = readFocusGeometry(map, {
      topOccluderEl: cardsWrapperRef.current,
      sheetSelector: null,
      minZoom: 13,
    });
    log.logMap("map:camera:focus", {
      trigger: "replay:coordinate-snap",
      lat: coord.lat,
      lon: coord.lon,
      viewport: geometry.viewport,
      topOccluder: geometry.topOccluder,
      bottomOccluder: geometry.bottomOccluder,
      band: geometry.band,
      target: geometry.target,
      anchor: geometry.anchor,
      padding: geometry.padding,
      zoom: geometry.zoom,
    });
    pendingFocusRef.current = {
      coord,
      trigger: "replay:coordinate-snap",
      sheetSelector: null,
      minZoom: 13,
      geometry,
    };
    focusAdjustArmRef.current = null;
    map.easeTo({
      center: [coord.lon, coord.lat],
      zoom: geometry.zoom,
      duration: 550,
      padding: geometry.padding,
    });
  }, [log, replayActive, replayPins, replayPlayheadIndex, token]);

  useEffect(() => {
    let cancelled = false;
    if (!finaleReplayActive) {
      if (finaleReplayStartedRef.current) {
        finaleReplayStartedRef.current = false;
        snappedReplayEventRef.current = null;
        setReplayActive(false);
        setReplayPlayheadIndex(null);
        setReplayPaused(false);
        log.logInteraction("finale:map-replay:stop");
      }
      return;
    }

    if (!canAttemptReplay) return;
    void loadReplayTrailSamples().then((samples) => {
      if (cancelled) return;
      const pins = buildReplayPins(replayJournalEvents, samples);
      if (pins.length <= 1) return;
      const resumeIndex = resolveReplayResumeIndex(token, pins);
      if (!finaleReplayStartedRef.current) {
        snappedReplayEventRef.current = null;
        finaleReplayStartedRef.current = true;
        setReplaySpeed((speed) => Math.max(speed, 2));
        log.logInteraction("finale:map-replay:start", {
          totalPins: pins.length,
          resumeIndex,
        });
      }
      setReplayActive(true);
      setReplayPlayheadIndex(resumeIndex);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canAttemptReplay, finaleReplayActive, loadReplayTrailSamples, log, replayJournalEvents, token]);

  // Close replay if any sheet/panel/menu opens. Pin taps, dock taps, and the
  // right-click context menu all funnel through these states, so a single effect
  // catches everything the user might do that isn't map panning/zooming. Finale
  // replays are not interactive — let them play through.
  useEffect(() => {
    if (!replayActive || finaleReplayActive) return;
    const anyUiOpen =
      selectedStoryDetail !== null ||
      isJournalOpen ||
      isMessagingOpen ||
      isTravelFundsSheetOpen ||
      isVotePanelOpen ||
      isTravelerStateOpen ||
      isAchievementsOpen ||
      isMissionsPanelOpen ||
      selectedCloakingPin !== null ||
      contextMenu !== null ||
      storyPrefill !== null;
    if (!anyUiOpen) return;
    music.sfx("close");
    snappedReplayEventRef.current = null;
    setReplayActive(false);
    setReplayPlayheadIndex(null);
    setReplayPaused(false);
    log.logInteraction("replay:close", { reason: "ui-opened", speed: replaySpeed });
  }, [
    replayActive,
    finaleReplayActive,
    selectedStoryDetail,
    isJournalOpen,
    isMessagingOpen,
    isTravelFundsSheetOpen,
    isVotePanelOpen,
    isTravelerStateOpen,
    isAchievementsOpen,
    isMissionsPanelOpen,
    selectedCloakingPin,
    contextMenu,
    storyPrefill,
    log,
    music,
    replaySpeed,
  ]);

  useEffect(() => {
    logMapEvent("map:proxy-url:resolved", {
      source: mapStyleResolution.source,
      configured: Boolean(mapStyleResolution.baseUrl),
      styleUrl: mapStyleUrl ?? undefined,
      convexHost: mapStyleResolution.convexHost,
    });
  }, [mapStyleResolution, mapStyleUrl]);

  const logMapFailureSummary = useCallback((action: string) => {
    const stats = mapFailureStatsRef.current;
    if (stats.total === 0) return;
    logMapEvent(action, {
      total: stats.total,
      counts: stats.counts,
      samples: stats.samples,
    });
  }, []);

  const handleMapTryAgain = useCallback(async () => {
    const previousCooldown = mapCooldownState;
    mapCooldownTriggeredRef.current = false;
    mapDiagnosticFetchUrlRef.current = null;
    mapFailureStatsRef.current = createMapFailureStats();
    logMapEvent("map:cooldown:retry-start", {
      previousCooldownUntil: previousCooldown.until,
      previousStrikes: previousCooldown.strikes,
      previousBackoffMs: previousCooldown.backoffMs,
      styleUrl: mapStyleUrl ?? undefined,
    });

    try {
      if (!mapStyleUrl) {
        throw new Error("Map style URL is not configured.");
      }
      const response = await fetch(mapStyleUrl, {
        method: "GET",
        cache: "no-store",
      });

      if (response.ok) {
        const nextState = resetMapCooldown();
        setMapCooldownState(nextState);
        if (!mapRef.current) {
          setMapInitRetryToken((value) => value + 1);
        }
        logMapEvent("map:cooldown:retry-success", {
          previousCooldownUntil: previousCooldown.until,
          previousStrikes: previousCooldown.strikes,
          previousBackoffMs: previousCooldown.backoffMs,
          status: response.status,
          resultingStrikes: nextState.strikes,
          resultingBackoffMs: nextState.backoffMs,
          resultingCooldownUntil: nextState.until,
        });
        showToast("Map service resumed.");
        return;
      }

      const nextState = triggerMapCooldown(Date.now());
      mapCooldownTriggeredRef.current = true;
      setMapCooldownState(nextState);
      const remainingMs = nextState.until ? Math.max(0, nextState.until - Date.now()) : 0;
      logMapError("map:cooldown:retry-failed", {
        previousCooldownUntil: previousCooldown.until,
        previousStrikes: previousCooldown.strikes,
        previousBackoffMs: previousCooldown.backoffMs,
        status: response.status,
        resultingStrikes: nextState.strikes,
        resultingBackoffMs: nextState.backoffMs,
        resultingCooldownUntil: nextState.until,
        remainingMs,
      });
      const minutesRemaining = Math.max(1, Math.ceil(remainingMs / 60_000));
      showToast(`Map service is still unavailable. It will attempt to resume in ${minutesRemaining} min.`);
    } catch (error) {
      const nextState = triggerMapCooldown(Date.now());
      mapCooldownTriggeredRef.current = true;
      setMapCooldownState(nextState);
      const remainingMs = nextState.until ? Math.max(0, nextState.until - Date.now()) : 0;
      logMapError("map:cooldown:retry-failed", {
        previousCooldownUntil: previousCooldown.until,
        previousStrikes: previousCooldown.strikes,
        previousBackoffMs: previousCooldown.backoffMs,
        message: error instanceof Error ? error.message : String(error),
        resultingStrikes: nextState.strikes,
        resultingBackoffMs: nextState.backoffMs,
        resultingCooldownUntil: nextState.until,
        remainingMs,
      });
      const minutesRemaining = Math.max(1, Math.ceil(remainingMs / 60_000));
      showToast(`Map service is still unavailable. It will attempt to resume in ${minutesRemaining} min.`);
    }
  }, [mapCooldownState, mapStyleUrl, showToast]);

  const fetchMapFailureDiagnostic = useCallback((url: string) => {
    if (mapDiagnosticFetchUrlRef.current !== null) return;
    mapDiagnosticFetchUrlRef.current = url;

    fetch(url, {
      method: "GET",
      cache: "no-store",
    }).then(async (response) => {
      const contentType = response.headers.get("Content-Type") ?? undefined;
      const bodyPreview = /json|text|xml|html/i.test(contentType ?? "")
        ? (await response.clone().text()).slice(0, 500)
        : undefined;

      logMapEvent("map:proxy-diagnostic", {
        url,
        status: response.status,
        ok: response.ok,
        contentType,
        proxyKind: response.headers.get("X-Tripcast-Map-Proxy-Kind") ?? undefined,
        proxyRequestId: response.headers.get("X-Tripcast-Map-Request-Id") ?? undefined,
        upstreamPath: response.headers.get("X-Tripcast-Map-Upstream-Path") ?? undefined,
        upstreamStatus: response.headers.get("X-Tripcast-Map-Upstream-Status") ?? undefined,
        upstreamHeaderProfile:
          response.headers.get("X-Tripcast-Map-Upstream-Header-Profile") ?? undefined,
        bodyPreview,
      });
    }).catch((error) => {
      logMapError("map:proxy-diagnostic:error", {
        url,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, []);

  const recordMapResourceFailure = useCallback((details: ReturnType<typeof mapLibreErrorDetails>) => {
    const kind = mapResourceKind(details.url, details.component);
    const statusKey = details.status === undefined ? "unknown" : String(details.status);
    const countKey = `${kind}:${statusKey}`;
    const stats = mapFailureStatsRef.current;
    stats.total += 1;
    stats.counts[countKey] = (stats.counts[countKey] ?? 0) + 1;

    const sampleKey = `${statusKey}:${details.url ?? details.message ?? kind}`;
    if (stats.samples.length < 5 && !stats.sampleKeys.has(sampleKey)) {
      stats.sampleKeys.add(sampleKey);
      const sample = {
        status: details.status,
        url: details.url,
        kind,
        message: details.message,
      };
      stats.samples.push(sample);
      logMapEvent("map:resource-failure:sample", sample);
    }

    return {
      kind,
      counts: stats.counts,
      total: stats.total,
    };
  }, []);

  useEffect(() => {
    mapServiceUnavailableRef.current = isMapServiceUnavailable;
  }, [isMapServiceUnavailable]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapStyleUrl) return;
    if (activeMapStyleUrlRef.current === null) {
      activeMapStyleUrlRef.current = mapStyleUrl;
      return;
    }
    if (activeMapStyleUrlRef.current === mapStyleUrl) return;

    const previousStyleUrl = activeMapStyleUrlRef.current;
    logMapEvent("map:style-switch:start", {
      previousStyleUrl,
      styleUrl: mapStyleUrl,
    });
    try {
      map.setStyle(mapStyleUrl);
      activeMapStyleUrlRef.current = mapStyleUrl;
      mapLoadedRef.current = false;
      mapFailureStatsRef.current = createMapFailureStats();
      logMapEvent("map:style-switch:success", {
        previousStyleUrl,
        styleUrl: mapStyleUrl,
      });
    } catch (error) {
      logMapError("map:style-switch:error", {
        previousStyleUrl,
        styleUrl: mapStyleUrl,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [mapStyleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (isMapServiceUnavailable && !mapInteractionsFrozenRef.current) {
      setMapInteractionsEnabled(map, false);
      mapInteractionsFrozenRef.current = true;
      logMapEvent("map:degraded-mode:enter", {
        hasMapInstance: true,
        hasLoaded: mapLoadedRef.current,
        cooldownUntil: mapCooldownState.until,
        remainingMs: mapCooldownState.until ? Math.max(0, mapCooldownState.until - Date.now()) : null,
        strikes: mapCooldownState.strikes,
        backoffMs: mapCooldownState.backoffMs,
      });
      logMapFailureSummary("map:resource-failure:summary");
      return;
    }
    if (!isMapServiceUnavailable && mapInteractionsFrozenRef.current) {
      setMapInteractionsEnabled(map, true);
      mapInteractionsFrozenRef.current = false;
      logMapEvent("map:degraded-mode:exit", {
        hasMapInstance: true,
        hasLoaded: mapLoadedRef.current,
        strikes: mapCooldownState.strikes,
      });
      mapFailureStatsRef.current = createMapFailureStats();
    }
  }, [isMapServiceUnavailable, logMapFailureSummary, mapCooldownState]);

  useEffect(() => {
    function syncCooldown() {
      setMapCooldownState(readMapCooldownState());
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === MAP_COOLDOWN_KEY) syncCooldown();
    }

    window.addEventListener(MAP_COOLDOWN_EVENT, syncCooldown);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(MAP_COOLDOWN_EVENT, syncCooldown);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (mapCooldownUntil === null) return;
    const delay = Math.max(0, mapCooldownUntil - Date.now());
    const timeout = setTimeout(() => {
      const nextState = readMapCooldownState();
      setMapCooldownState(nextState);
      if (nextState.until === null && !mapRef.current) {
        setMapInitRetryToken((value) => value + 1);
      }
    }, delay);
    return () => clearTimeout(timeout);
  }, [mapCooldownUntil]);

  function openJournal(debugSource: DebugOpenSource = UNKNOWN_DEBUG_SOURCE) {
    if (isJournalOpen) {
      log.logInteraction("panel:close", { panel: "journal" });
      music.sfx("close");
      setIsJournalOpen(false);
      return;
    }
    setJournalDebugSource(debugSource);
    log.logInteraction("panel:open", { panel: "journal" });
    performance.mark("tripcast:debug:journal:open");
    music.sfx("open");
    setIsJournalOpen(true);
    setIsMissionsPanelOpen(false);
    setIsVotePanelOpen(false);
    setIsTravelFundsSheetOpen(false);
    setIsAchievementsOpen(false);
    setIsMessagingOpen(false);
  }
  function openMissions(debugSource: DebugOpenSource = UNKNOWN_DEBUG_SOURCE) {
    if (isMissionsPanelOpen) {
      log.logInteraction("panel:close", { panel: "Missions" });
      music.sfx("close");
      setIsMissionsPanelOpen(false);
      return;
    }
    setMissionsDebugSource(debugSource);
    log.logInteraction("panel:open", { panel: "Missions" });
    performance.mark("tripcast:debug:Missions:open");
    music.sfx("open");
    setIsMissionsPanelOpen(true);
    setIsJournalOpen(false);
    setIsVotePanelOpen(false);
    setIsTravelFundsSheetOpen(false);
    setIsAchievementsOpen(false);
    setIsMessagingOpen(false);
  }
  function openVotes(debugSource: DebugOpenSource = UNKNOWN_DEBUG_SOURCE) {
    if (isVotePanelOpen) {
      log.logInteraction("panel:close", { panel: "votes" });
      music.sfx("close");
      setIsVotePanelOpen(false);
      return;
    }
    setVotesDebugSource(debugSource);
    log.logInteraction("panel:open", { panel: "votes" });
    performance.mark("tripcast:debug:votes:open");
    music.sfx("open");
    setIsVotePanelOpen(true);
    setIsJournalOpen(false);
    setIsMissionsPanelOpen(false);
    setIsTravelFundsSheetOpen(false);
    setIsAchievementsOpen(false);
    setIsMessagingOpen(false);
  }
  function openVotesFromSplash() {
    openVotes({
      source: "vote-time-splash",
      sourceLabel: "Vote Time Splash -> Votes",
    });
  }
  function openFunds(debugSource: DebugOpenSource = UNKNOWN_DEBUG_SOURCE) {
    if (isTravelFundsSheetOpen) {
      log.logInteraction("panel:close", { panel: "funds" });
      music.sfx("close");
      setIsTravelFundsSheetOpen(false);
      return;
    }
    setFundsDebugSource(debugSource);
    log.logInteraction("panel:open", { panel: "funds" });
    performance.mark("tripcast:debug:funds:open");
    music.sfx("open");
    setIsTravelFundsSheetOpen(true);
    setIsJournalOpen(false);
    setIsMissionsPanelOpen(false);
    setIsVotePanelOpen(false);
    setIsAchievementsOpen(false);
    setIsMessagingOpen(false);
  }
  function openMessaging() {
    if (isMessagingOpen) {
      music.sfx("close");
      setIsMessagingOpen(false);
      return;
    }
    music.sfx("open");
    setIsMessagingOpen(true);
    setIsJournalOpen(false);
    setIsMissionsPanelOpen(false);
    setIsVotePanelOpen(false);
    setIsTravelFundsSheetOpen(false);
    setIsAchievementsOpen(false);
  }
  function openAchievements() {
    if (isAchievementsOpen) {
      log.logInteraction("panel:close", { panel: "achievements" });
      music.sfx("close");
      setIsAchievementsOpen(false);
      return;
    }
    log.logInteraction("panel:open", { panel: "achievements" });
    performance.mark("tripcast:debug:achievements:open");
    music.sfx("open");
    setIsAchievementsOpen(true);
    setIsJournalOpen(false);
    setIsMissionsPanelOpen(false);
    setIsVotePanelOpen(false);
    setIsTravelFundsSheetOpen(false);
    setIsMessagingOpen(false);
  }

  const forceOpenMissions = useCallback((debugSource: DebugOpenSource = UNKNOWN_DEBUG_SOURCE) => {
    setMissionsDebugSource(debugSource);
    setIsMissionsPanelOpen(true);
    setIsJournalOpen(false);
    setIsVotePanelOpen(false);
    setIsTravelFundsSheetOpen(false);
    setIsAchievementsOpen(false);
    setIsMessagingOpen(false);
  }, []);

  const activeDockTab: DockTab | null = isJournalOpen
    ? "journal"
    : isMissionsPanelOpen
      ? "missions"
      : isVotePanelOpen
        ? "votes"
        : isTravelFundsSheetOpen
          ? "funds"
          : isAchievementsOpen
            ? "achievements"
            : isMessagingOpen
              ? "messaging"
            : null;

  function handleDockSelect(tab: DockTab) {
    if (coordinatePickModeRef.current) cancelCoordinatePick();
    setFanOpen(false);
    setIsTravelerStateOpen(false);
    if (tab === "journal") openJournal({ source: "dock:journal", sourceLabel: "Dock -> Journal" });
    else if (tab === "missions") openMissions({ source: "dock:missions", sourceLabel: "Dock -> Missions" });
    else if (tab === "votes") openVotes({ source: "dock:votes", sourceLabel: "Dock -> Votes" });
    else if (tab === "funds") openFunds({ source: "dock:funds", sourceLabel: "Dock -> Funds" });
    else if (tab === "messaging") openMessaging();
    else if (tab === "achievements") openAchievements();
  }

  function handleDockAdd() {
    if (coordinatePickModeRef.current) cancelCoordinatePick();
    music.sfx("tap");
    setFanOpen((prev) => !prev);
  }

  function handleFanPick(action: FanAction) {
    if (coordinatePickModeRef.current) cancelCoordinatePick();
    music.sfx("tap");
    setFanOpen(false);
    switch (action) {
      case "checkin":
        log.logInteraction("placement:enter", { trigger: "fan:checkin" });
        performance.mark("tripcast:debug:placement:enter");
        setCheckInDebugSource({ source: "fan-menu:checkin", sourceLabel: "FanMenu -> Check In" });
        setSelectedCoordinate(null);
        setIsPlacementMode(true);
        break;
      case "transaction":
        openFunds({ source: "fan-menu:transaction", sourceLabel: "FanMenu -> Add Transaction" });
        break;
      case "mission":
        openMissions({ source: "fan-menu:mission", sourceLabel: "FanMenu -> Add Mission" });
        break;
      case "status":
        setStateDebugSource({ source: "fan-menu:status", sourceLabel: "FanMenu -> Update Status" });
        setIsTravelerStateOpen(true);
        break;
      case "vote":
        openVotes({ source: "fan-menu:vote", sourceLabel: "FanMenu -> Add Vote" });
        break;
    }
  }

  // Keep placement mode ref in sync
  useEffect(() => {
    placementModeRef.current = isPlacementMode;
    if (isPlacementMode) {
      stopFollowing();
    }
  }, [isPlacementMode, stopFollowing]);

  // Clear the preview pin whenever every form-bearing sheet is closed — the
  // user is done with the flow that owned the picked coord.
  useEffect(() => {
    if (
      !isMissionsPanelOpen &&
      !isJournalOpen &&
      !isVotePanelOpen &&
      !isMissionDetailOpen
    ) {
      setPreviewCoord(null);
    }
  }, [isMissionsPanelOpen, isJournalOpen, isVotePanelOpen, isMissionDetailOpen]);

  // Called by form panels after a successful save so the preview pin retires
  // once the real mission/story marker takes over.
  const clearPreviewPin = useCallback(() => setPreviewCoord(null), []);

  const cancelCoordinatePick = useCallback(() => {
    log.logInteraction("coordinate:pick-mode:cancel");
    coordinatePickModeRef.current = null;
    setCoordinatePickMode(null);
    setPickCenter(null);
  }, [log]);

  function confirmCoordinatePick() {
    const pick = coordinatePickModeRef.current;
    const map = mapRef.current;
    if (!pick || !map) return;
    const center = map.getCenter();
    const coord = { lat: center.lat, lon: center.lng };
    log.logInteraction("coordinate:pick-mode:confirm", {
      lat: coord.lat,
      lon: coord.lon,
      label: pick.label,
    });
    log.logInteraction("coordinate:picked", {
      lat: coord.lat,
      lon: coord.lon,
      source: "coordinate-pick",
    });
    musicRef.current.sfx("pin");
    const sheetSelector = pick.sheetSelector;
    coordinatePickModeRef.current = null;
    setCoordinatePickMode(null);
    setPickCenter(null);
    setPreviewCoord(coord);
    pick.callback(coord);
    // Recenter the camera so the picked point lands above the returning sheet.
    // We bypass the focusCoordinate / applyActiveFocus pipeline here because it
    // measures DOM occluders (cardsWrapperRef, sheetSelector) — and the gotchas
    // in docs/agents/implementation-gotchas.md note that map vs. style/DOM
    // measurement races are fragile when overlays toggle visibility in the same
    // React commit. A direct easeTo with a measured offset is independent of
    // when the sheet's `invisible` class flushes. We schedule on rAF so the
    // sheet has dropped `invisible` before measuring its height.
    if (sheetSelector) {
      requestAnimationFrame(() => {
        const m = mapRef.current;
        if (!m) return;
        const sheetEl = document.querySelector(sheetSelector) as HTMLElement | null;
        const sheetH = sheetEl?.getBoundingClientRect().height ?? 0;
        const topEl = cardsWrapperRef.current;
        const topH = topEl ? topEl.getBoundingClientRect().height : 0;
        // Positive offset.y moves the target DOWN on screen, negative moves it
        // UP. We want the coord to land at the center of the visible band
        // between the status card (top, topH) and the returning sheet (bottom,
        // sheetH). Band center sits at (topH - sheetH)/2 relative to the
        // container center — negative when the sheet is taller than the card.
        const offsetY = (topH - sheetH) / 2;
        log.logMap("coordinate-pick:recenter", {
          lat: coord.lat,
          lon: coord.lon,
          sheetH: Math.round(sheetH),
          topH: Math.round(topH),
          offsetY: Math.round(offsetY),
        });
        stopFollowing();
        m.easeTo({
          center: [coord.lon, coord.lat],
          offset: [0, offsetY],
          duration: 600,
        });
      });
    }
  }

  // ESC cancels coordinate pick mode; live-track map center while picking.
  // The move listener is rAF-coalesced so React renders at most once per frame
  // regardless of how aggressively MapLibre fires `move` during a drag.
  useEffect(() => {
    onPickerActiveChange?.(Boolean(coordinatePickMode));
    if (!coordinatePickMode) {
      setPickCenter(null);
      return;
    }
    // Clear the preview pin from a previous confirm — re-entering pick mode
    // means the user is about to choose a new spot.
    setPreviewCoord(null);
    stopFollowing();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") cancelCoordinatePick();
    }
    document.addEventListener("keydown", handleKeyDown);

    const map = mapRef.current;
    if (!map) {
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
    // Reset MapLibre's camera padding when entering pick mode — any leftover
    // padding from a prior focusCoordinate call (e.g. the mission-detail focus
    // that put the pin in the band above the sheet) would otherwise place the
    // map center off-axis from the crosshair. With the originating sheet now
    // hidden, the picker should treat the full container as the visible map.
    // jumpTo (not easeTo) sidesteps a race: when picker enters, the top
    // wrapper collapses → map container resizes → MapLibre re-projects, and an
    // animated easeTo overlaps that resize unpredictably. jumpTo commits the
    // new center+padding atomically.
    const zeroPadding = { top: 0, right: 0, bottom: 0, left: 0 };
    const initialCoord = coordinatePickMode.initialCoord;
    if (
      initialCoord &&
      Number.isFinite(initialCoord.lat) &&
      Number.isFinite(initialCoord.lon)
    ) {
      map.jumpTo({
        center: [initialCoord.lon, initialCoord.lat],
        padding: zeroPadding,
      });
      setPickCenter({ lat: initialCoord.lat, lon: initialCoord.lon });
    } else {
      const initial = map.getCenter();
      map.jumpTo({
        center: [initial.lng, initial.lat],
        padding: zeroPadding,
      });
      setPickCenter({ lat: initial.lat, lon: initial.lng });
    }
    let rafId: number | null = null;
    const handleMove = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const c = map.getCenter();
        setPickCenter({ lat: c.lat, lon: c.lng });
      });
    };
    map.on("move", handleMove);
    return () => {
      map.off("move", handleMove);
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [coordinatePickMode, cancelCoordinatePick, stopFollowing, onPickerActiveChange]);

  // Map init
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const initialMapStyleUrl = latestMapStyleUrlRef.current;
    const activeCooldown = getActiveMapCooldown();
    if (activeCooldown) {
      const activeCooldownState = readMapCooldownState();
      logMapEvent("map:cooldown:active", {
        cooldownUntil: activeCooldown,
        remainingMs: Math.max(0, activeCooldown - Date.now()),
        strikes: activeCooldownState.strikes,
        backoffMs: activeCooldownState.backoffMs,
        source: "sessionStorage",
      });
      setMapCooldownState(activeCooldownState);
      return;
    }
    if (!initialMapStyleUrl) {
      logMapError("map:proxy-url:missing", {
        env: "VITE_CONVEX_SITE_URL",
        devFallback: import.meta.env.DEV,
      });
      return;
    }

    mapCooldownTriggeredRef.current = false;
    mapDiagnosticFetchUrlRef.current = null;
    mapFailureStatsRef.current = createMapFailureStats();
    logMapEvent("map:init:start", {
      styleUrl: initialMapStyleUrl,
    });
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: initialMapStyleUrl,
      center: SEATTLE_CENTER,
      zoom: 11,
      minZoom: 2,
      maxZoom: 18,
      collectResourceTiming: false,
    });

    map.on("load", () => {
      mapLoadedRef.current = true;
      setMapStyleError(null);
      logMapEvent("map:load:success", {
        styleUrl: activeMapStyleUrlRef.current ?? initialMapStyleUrl,
        zoom: map.getZoom(),
      });
      onMapLoadedRef.current?.();
    });

    map.on("error", (event) => {
      const details = mapLibreErrorDetails(event);
      const resourceFailure = recordMapResourceFailure(details);
      logMapError("map:error", {
        ...details,
        resourceKind: resourceFailure.kind,
      });
      // A failed basemap style fetch (any status) leaves a blank map. The
      // 403/429 cooldown path below already surfaces a banner; this captures
      // the other cases (e.g. a 404 from a misconfigured proxy host) so they
      // are not silent.
      if (resourceFailure.kind === "style") {
        setMapStyleError({ status: details.status });
      }
      if (details.status === 403 || details.status === 429) {
        if (mapCooldownTriggeredRef.current) {
          logMapEvent("map:cooldown:duplicate-error", {
            ...details,
            resourceKind: resourceFailure.kind,
            reason: "cooldown-already-triggered",
          });
          return;
        }
        if (details.url) {
          fetchMapFailureDiagnostic(details.url);
        }
        mapCooldownTriggeredRef.current = true;
        const cooldownState = triggerMapCooldown(Date.now());
        const cooldownUntil = cooldownState.until;
        logMapError("map:cooldown:triggered", {
          ...details,
          resourceKind: resourceFailure.kind,
          cooldownUntil,
          remainingMs: cooldownUntil ? Math.max(0, cooldownUntil - Date.now()) : 0,
          strikes: cooldownState.strikes,
          backoffMs: cooldownState.backoffMs,
          failureCounts: resourceFailure.counts,
          failureTotal: resourceFailure.total,
          reason: "maplibre-error-status",
        });
        logMapFailureSummary("map:resource-failure:summary");
        setMapCooldownState(cooldownState);
        setContextMenu(null);
        const minutesRemaining = cooldownUntil
          ? Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 60_000))
          : 1;
        showToast(`Map Service Unavailable. It will attempt to resume in ${minutesRemaining} min.`);
      }
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");

    map.on("contextmenu", (event) => {
      event.preventDefault();
      const { lat, lng: lon } = event.lngLat;
      const point = map.project(event.lngLat);
      log.logUi("map:context-menu:open", { lat, lon, trigger: "right-click" });
      setContextMenu({ x: point.x, y: point.y, lat, lon });
    });

    let touchTimer: ReturnType<typeof setTimeout> | null = null;
    map.on("touchstart", (e) => {
      stopFollowing();
      if (e.points.length > 1) return;
      touchTimer = setTimeout(() => {
        const { lat, lng: lon } = e.lngLat;
        const point = map.project(e.lngLat);
        log.logUi("map:context-menu:open", { lat, lon, trigger: "long-press" });
        setContextMenu({ x: point.x, y: point.y, lat, lon });
      }, 600);
    });
    map.on("touchend", () => touchTimer && clearTimeout(touchTimer));
    map.on("touchmove", () => touchTimer && clearTimeout(touchTimer));
    map.on("mousedown", () => setContextMenu(null));
    map.on("dragstart", () => {
      stopFollowing();
      setContextMenu(null);
    });
    map.on("zoomstart", (event) => {
      if ((event as { originalEvent?: unknown }).originalEvent) {
        stopFollowing();
      }
      setContextMenu(null);
    });

    map.on("click", (event) => {
      setContextMenu(null);
      if (isEnabled() && isCategoryEnabled("interaction")) {
        const features = map.queryRenderedFeatures(event.point);
        rawLog("info", "TripMap", "map:click", "interaction", {
          screenX: Math.round(event.point.x),
          screenY: Math.round(event.point.y),
          viewportW: map.getContainer().clientWidth,
          viewportH: map.getContainer().clientHeight,
          lat: parseFloat(event.lngLat.lat.toFixed(5)),
          lon: parseFloat(event.lngLat.lng.toFixed(5)),
          zoom: parseFloat(map.getZoom().toFixed(2)),
          pointerType: (event.originalEvent as PointerEvent).pointerType || undefined,
          featuresHit: features.slice(0, 5).map((f) => ({ id: f.id, source: f.source, layer: f.layer?.id })),
          markerHit: features.length > 0,
        });
      }

      // Picker in progress — tapping anywhere recenters the map on that point
      // (the crosshair stays fixed at the center). The user confirms via the
      // bottom "Use this location" button, which reads map.getCenter().
      // Explicit zero padding is required: MapLibre retains the camera padding
      // from prior focusCoordinate calls, which would otherwise place the
      // clicked lngLat at the band center instead of the geometric center
      // (where the crosshair sits).
      if (coordinatePickModeRef.current) {
        map.easeTo({
          center: event.lngLat,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          duration: 300,
        });
        return;
      }

      if (!placementModeRef.current) return;
      log.logInteraction("coordinate:picked", { lat: event.lngLat.lat, lon: event.lngLat.lng, source: "placement" });
      setIsPlacementMode(false);
      musicRef.current.sfx("pin");
      setCheckInDebugSource({ source: "fan-menu:checkin", sourceLabel: "FanMenu -> Check In" });
      setSelectedCoordinate({
        lat: event.lngLat.lat,
        lon: event.lngLat.lng,
        source: "tap_add_mode",
      });
    });

    // Focus observability: after a programmatic focus, log where the pin
    // actually settled; then briefly treat a user pan as "teach me the spot."
    map.on("moveend", (event) => {
      const userDriven = Boolean((event as { originalEvent?: unknown }).originalEvent);

      if (!userDriven && pendingFocusRef.current) {
        const focus = pendingFocusRef.current;
        pendingFocusRef.current = null;
        const settledGeo = readFocusGeometry(map, {
          topOccluderEl: cardsWrapperRef.current,
          sheetSelector: focus.sheetSelector,
          minZoom: focus.minZoom,
        });
        const pt = map.project([focus.coord.lon, focus.coord.lat]);
        const screen = { x: Math.round(pt.x), y: Math.round(pt.y) };
        log.logMap("map:camera:focus:settled", {
          trigger: focus.trigger,
          screen,
          bandFraction: bandFractionOf(screen, settledGeo),
          occluded: isOccluded(screen, settledGeo),
        });
        focusAdjustArmRef.current = {
          ...focus,
          geometry: settledGeo,
          until: Date.now() + FOCUS_TEACH_WINDOW_MS,
        };
        return;
      }

      if (userDriven && focusAdjustArmRef.current) {
        const arm = focusAdjustArmRef.current;
        focusAdjustArmRef.current = null;
        if (Date.now() > arm.until) return;
        const pt = map.project([arm.coord.lon, arm.coord.lat]);
        const screen = { x: Math.round(pt.x), y: Math.round(pt.y) };
        const from = arm.geometry.target;
        const dx = screen.x - from.x;
        const dy = screen.y - from.y;
        // In calibration mode, drop sub-threshold mouse jitter and round the
        // implied anchor so the logged number is a clean teaching target.
        const calibrating = calibrationRef.current;
        if (calibrating && Math.hypot(dx, dy) < FOCUS_ADJUST_MIN_PX) return;
        const toBandFraction = bandFractionOf(screen, arm.geometry);
        const impliedAnchor = calibrating
          ? { x: Number(toBandFraction.x.toFixed(2)), y: Number(toBandFraction.y.toFixed(2)) }
          : toBandFraction;
        log.logMap("map:camera:focus:user-adjust", {
          trigger: arm.trigger,
          calibrating,
          deltaPx: { dx, dy },
          fromBandFraction: bandFractionOf(from, arm.geometry),
          toBandFraction,
          // The fraction the user dragged the pin to IS the anchor they want.
          impliedAnchor,
        });
      }
    });

    mapRef.current = map;
    activeMapStyleUrlRef.current = initialMapStyleUrl;
    setMapInstance(map);

    return () => {
      sheetResizeObserverRef.current?.disconnect();
      sheetResizeObserverRef.current = null;
      if (sheetResizeDebounceRef.current) clearTimeout(sheetResizeDebounceRef.current);
      sheetResizeDebounceRef.current = null;
      activeFocusRef.current = null;
      map.remove();
      mapRef.current = null;
      activeMapStyleUrlRef.current = null;
      setMapInstance(null);
      mapLoadedRef.current = false;
      mapInteractionsFrozenRef.current = false;
    };
  }, [
    canWrite,
    fetchMapFailureDiagnostic,
    forceOpenMissions,
    role,
    log,
    logMapFailureSummary,
    mapInitRetryToken,
    recordMapResourceFailure,
    showToast,
    stopFollowing,
  ]);

  // When no focus-driving sheet is open, drop the active focus + observer so a
  // sheet's animate-out can't trigger a recenter (the map stays put on close).
  useEffect(() => {
    const focusSheetOpen =
      Boolean(selectedStoryDetail) || isMissionsPanelOpen || isJournalOpen || isVotePanelOpen;
    if (focusSheetOpen) return;
    activeFocusRef.current = null;
    sheetResizeObserverRef.current?.disconnect();
    sheetResizeObserverRef.current = null;
    if (sheetResizeDebounceRef.current) {
      clearTimeout(sheetResizeDebounceRef.current);
      sheetResizeDebounceRef.current = null;
    }
  }, [selectedStoryDetail, isMissionsPanelOpen, isJournalOpen, isVotePanelOpen]);

  useEffect(() => {
    isLocationSharingRef.current = isLocationSharing;
  }, [isLocationSharing]);

  useEffect(() => {
    livePositionRef.current = livePosition;
  }, [livePosition]);

  useEffect(() => {
    liveTrailEnabledRef.current = liveTrailEnabled;
    liveTrailCanRecordRef.current = liveTrailEnabled;
    if (!travelerLiveTrailStatus) return;
    const latestSample = travelerLiveTrailStatus.samples.at(-1);
    if (latestSample) {
      lastLiveTrailSampleRef.current = {
        lat: latestSample.lat,
        lon: latestSample.lon,
        sentAt: latestSample.sampledAt,
      };
    } else {
      lastLiveTrailSampleRef.current = null;
    }
  }, [liveTrailEnabled, travelerLiveTrailStatus]);

  useEffect(() => {
    const pins = cloakingPinsData ?? [];
    cloakingPinsRef.current = pins;

    // Re-evaluate zone membership whenever pins change (e.g. deleted while inside).
    // Uses livePositionRef so position changes don't trigger this effect.
    if (insideCloakingZoneRef.current) {
      const pos = livePositionRef.current;
      const stillInside =
        pos !== null &&
        pins.some((pin) => distanceMeters({ lat: pos.lat, lon: pos.lon }, { lat: pin.lat, lon: pin.lon }) <= pin.radiusMeters);
      if (!stillInside) {
        insideCloakingZoneRef.current = false;
        enteredCloakAtRef.current = null;
        cloakToastShownRef.current = false;
        cloakAutoShutoffFiredRef.current = false;
        try { localStorage.removeItem("tripcast.cloaking.enteredAt"); } catch { /* storage unavailable */ }
      }
    }
  }, [cloakingPinsData]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("tripcast.cloaking.enteredAt");
      if (stored) {
        const ts = Number(stored);
        if (!isNaN(ts)) enteredCloakAtRef.current = ts;
      }
    } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    if (!liveTrailPathVisible) return;
    log.logMap("live-trail:render", {
      role,
      sampleCount: liveTrailSamples.length,
      visible: true,
    });
  }, [liveTrailPathVisible, liveTrailSamples.length, log, role]);

  const centerMapOnCoordinate = useCallback(
    (coordinate: { lat: number; lon: number }) => {
      const map = mapRef.current;
      if (!map) return;
      if (mapServiceUnavailableRef.current) {
        logMapEvent("map:camera:blocked", { trigger: "center:location" });
        showToast("Map movement is paused until the map service resumes.");
        return;
      }
      log.logInteraction("map:camera:move", { lat: coordinate.lat, lon: coordinate.lon, trigger: "center:location" });
      // Reset any persistent padding set by handleNavigateToMission before easing
      map.easeTo({
        center: [coordinate.lon, coordinate.lat],
        zoom: Math.max(map.getZoom(), 14),
        duration: 700,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      });
    },
    [log, showToast],
  );

  useEffect(() => {
    if (!isFollowing) return;
    const currentLocation =
      role === "traveler"
        ? (livePosition ?? storedTravelerLocation ?? null)
        : (storedTravelerLocation ?? null);

    if (currentLocation) {
      centerMapOnCoordinate(currentLocation);
    }
  }, [centerMapOnCoordinate, isFollowing, livePosition, storedTravelerLocation, role]);

  // Track location for Travelers. On a native (Capacitor) build, use the
  // background-capable watcher when "Live" is ON; otherwise fall back to
  // the foreground-only browser API to show the local GPS dot without
  // draining battery for background tracking.
  useEffect(() => {
    if (role !== "traveler") {
      setLocationStale(false);
      return;
    }

    lastLocationFixAtRef.current = Date.now();
    setLocationStale(false);

    // Movement detection state — kept local to this effect so it resets when
    // the watcher restarts (e.g. after toggling Live).
    let lastMovementClassification: "walking" | "moving" | "stopped" | null = null;
    let lastMovementMutationAt = 0;
    let prevFixForSpeed: { lat: number; lon: number; at: number } | null = null;
    const MOVEMENT_MUTATION_MIN_INTERVAL_MS = 60_000;

    const handleFix = (lat: number, lon: number, accuracy?: number, speed?: number) => {
      lastLocationFixAtRef.current = Date.now();
      setLocationStale(false);
      if (liveTrailEnabledRef.current && !liveTrailPermissionLoggedRef.current) {
        liveTrailPermissionLoggedRef.current = true;
        log.logInteraction("live-trail:permission:result", { result: "granted" });
      }
      const nextPosition = { lat, lon, accuracy };
      livePositionRef.current = nextPosition;
      setLivePosition(nextPosition);

      // ── Cloaking zone suppression ─────────────────────────────────────────
      const pins = cloakingPinsRef.current;
      const nowInsideZone =
        pins.length > 0 &&
        pins.some((pin) => distanceMeters({ lat, lon }, { lat: pin.lat, lon: pin.lon }) <= pin.radiusMeters);

      if (nowInsideZone) {
        if (!insideCloakingZoneRef.current) {
          insideCloakingZoneRef.current = true;
          cloakToastShownRef.current = false;
          cloakAutoShutoffFiredRef.current = false;
          if (!enteredCloakAtRef.current) {
            const ts = Date.now();
            enteredCloakAtRef.current = ts;
            try { localStorage.setItem("tripcast.cloaking.enteredAt", String(ts)); } catch { /* storage unavailable */ }
          }
        }
        const enteredAt = enteredCloakAtRef.current;
        if (enteredAt) {
          const elapsed = Date.now() - enteredAt;
          if (!cloakToastShownRef.current && elapsed >= 30_000) {
            cloakToastShownRef.current = true;
            showToast("You have entered a cloaked zone.");
          }
          try {
            const timeoutMinutes = Number(
              localStorage.getItem("tripcast.cloaking.autoDisableGpsTimeoutMinutes") ?? "5",
            );
            if (
              timeoutMinutes > 0 &&
              !cloakAutoShutoffFiredRef.current &&
              elapsed >= timeoutMinutes * 60_000 &&
              isLocationSharingRef.current
            ) {
              cloakAutoShutoffFiredRef.current = true;
              stopLocationSharing();
            }
          } catch { /* storage unavailable */ }
        }
        return;
      }

      if (!nowInsideZone && insideCloakingZoneRef.current) {
        insideCloakingZoneRef.current = false;
        enteredCloakAtRef.current = null;
        cloakToastShownRef.current = false;
        cloakAutoShutoffFiredRef.current = false;
        try { localStorage.removeItem("tripcast.cloaking.enteredAt"); } catch { /* storage unavailable */ }
      }
      // ── End cloaking ──────────────────────────────────────────────────────

      if (isLocationSharingRef.current) {
        publishTravelerLocation(nextPosition, accuracy);
        if (liveTrailEnabledRef.current && liveTrailCanRecordRef.current) {
          publishLiveTrailSample(nextPosition, accuracy);
        }
      }

      // ── Movement auto-state (Capacitor-only) ──────────────────────────────
      // Classify GPS speed into walking/moving/stopped and notify the backend
      // when the classification transitions. Native-only because reliable
      // background GPS is only available on the iOS Capacitor build.
      if (isNativeLocationAvailable()) {
        const prefs = movementPrefsRef.current;
        const fixAt = Date.now();
        if (prefs?.movementDetectionEnabled === true) {
          const walkingMps = prefs.movementWalkingThresholdMps ?? DEFAULT_WALKING_MPS;
          const movingMps = prefs.movementMovingThresholdMps ?? DEFAULT_MOVING_MPS;
          let speedMps: number | undefined =
            typeof speed === "number" && speed >= 0 ? speed : undefined;
          if (speedMps === undefined && prevFixForSpeed) {
            const dtSec = (fixAt - prevFixForSpeed.at) / 1000;
            if (dtSec > 0 && dtSec < 600) {
              const dMeters = distanceMeters(prevFixForSpeed, { lat, lon });
              speedMps = dMeters / dtSec;
            }
          }
          const classification: "walking" | "moving" | "stopped" =
            speedMps === undefined
              ? "stopped"
              : speedMps >= movingMps
                ? "moving"
                : speedMps >= walkingMps
                  ? "walking"
                  : "stopped";

          // Movement debug telemetry — always-on recording when detection is
          // enabled. Live speed updates only while calibration mode is on
          // (high-frequency, only useful while the debug modal is open).
          const debug = movementDebugRef.current;
          if (debug.records.isCalibrationModeEnabled && speedMps !== undefined) {
            debug.speed.recordCurrentSpeed(speedMps);
          }
          if (speedMps !== undefined) {
            const inWalkingNearMiss =
              classification === "stopped" &&
              speedMps >= 0.9 * walkingMps &&
              speedMps <= 0.99 * walkingMps;
            const inMovingNearMiss =
              classification !== "moving" &&
              speedMps >= 0.9 * movingMps &&
              speedMps <= 0.99 * movingMps;
            if (inWalkingNearMiss) {
              debug.records.recordAlmostTriggered({
                thresholdType: "walking",
                speedMps,
                thresholdMps: walkingMps,
              });
            }
            if (inMovingNearMiss) {
              debug.records.recordAlmostTriggered({
                thresholdType: "moving",
                speedMps,
                thresholdMps: movingMps,
              });
            }
          }

          const changed = classification !== lastMovementClassification;
          const throttleOk = fixAt - lastMovementMutationAt >= MOVEMENT_MUTATION_MIN_INTERVAL_MS;
          if (changed && classification !== "stopped" && (throttleOk || lastMovementClassification === null)) {
            const from = lastMovementClassification;
            lastMovementClassification = classification;
            lastMovementMutationAt = fixAt;
            log.logUi("movement:classify", { speedMps, classification, from });
            const triggeredSpeedMps = speedMps;
            applyMovementDetection({
              token,
              classification,
              speedMps,
              sampledAt: fixAt,
            })
              .then(() => {
                if (triggeredSpeedMps === undefined) return;
                movementDebugRef.current.records.recordTriggered({
                  from,
                  to: classification,
                  speedMps: triggeredSpeedMps,
                });
              })
              .catch((error) => {
                log.error("movement:apply:error", "mutation", {
                  message: error instanceof Error ? error.message : String(error),
                });
              });
          } else if (changed) {
            lastMovementClassification = classification;
          }
        }
        prevFixForSpeed = { lat, lon, at: fixAt };
      }
    };

    const handleError = (error: unknown) => {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? (error as { code?: unknown }).code
          : undefined;
      // Native/Web: location was denied. Toast once per session, but do not let
      // passive foreground GPS consume the native settings handoff for Live.
      if (code === "NOT_AUTHORIZED" || code === 1) {
        if (!locationDeniedPromptedRef.current) {
          locationDeniedPromptedRef.current = true;
          showToast("Location access is off for TripCast. You can enable it in your device settings.");
        }
        if (
          isLocationSharingRef.current &&
          isNativeLocationAvailable() &&
          !locationDeniedSettingsOpenedRef.current
        ) {
          locationDeniedSettingsOpenedRef.current = true;
          openNativeLocationSettings();
        }
      }
      if (!liveTrailEnabledRef.current) return;
      log.logInteraction("live-trail:permission:result", { result: "denied", code });
    };

    let cleanup: () => void = () => {};

    if (isLocationSharing && isNativeLocationAvailable()) {
      log.logInteraction("live-trail:native-watch:start", {});
      const stop = startNativeLocationWatch(
        (fix) => handleFix(fix.lat, fix.lon, fix.accuracy, fix.speed),
        handleError,
      );
      cleanup = () => {
        log.logInteraction("live-trail:native-watch:stop", {});
        stop();
      };
    } else if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => handleFix(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy ?? undefined,
          typeof pos.coords.speed === "number" && pos.coords.speed >= 0 ? pos.coords.speed : undefined,
        ),
        handleError,
        { enableHighAccuracy: true },
      );
      browserLocationWatchRef.current = watchId;
      cleanup = () => {
        navigator.geolocation.clearWatch(watchId);
        if (browserLocationWatchRef.current === watchId) {
          browserLocationWatchRef.current = null;
        }
      };
    }

    // Native only: if LIVE is on but no fix has landed in a while, the plugin
    // may have silently stalled (iOS background-task timeout, system location
    // throttling). Try a one-shot getCurrentPosition poke — it bypasses the
    // distanceFilter, so it succeeds even when the user is standing still. Only
    // if the poke itself fails do we surface the stale banner.
    const STALE_AFTER_MS = 20 * 60_000;
    const staleInterval = setInterval(() => {
      if (!isNativeLocationAvailable()) return;
      const last = lastLocationFixAtRef.current;
      if (last !== null && Date.now() - last > STALE_AFTER_MS) {
        navigator.geolocation.getCurrentPosition(
          (pos) => handleFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? undefined),
          () => setLocationStale(true),
          { timeout: 10000 },
        );
      }
    }, 60_000);

    return () => {
      cleanup();
      clearInterval(staleInterval);
    };
  // publish* only uses refs plus stable mutation inputs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocationSharing, role, token, log]);

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (locationResetNonce === 0) return;
    stopLocationSharing();
  // stopLocationSharing only touches refs + stable mutation handles; its
  // identity changes per render but its behavior is closure-stable here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationResetNonce]);

  useEffect(() => {
    if (role !== "traveler") return;

    function handlePageHide() {
      if (!isLocationSharingRef.current) return;
      stopTravelerLocationSharing({ token }).catch(() => {});
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [role, stopTravelerLocationSharing, token]);

  useEffect(() => {
    if (tripDataResetNonce === 0) return;
    setIsVotePanelOpen(false);
    stopFollowing();
    setVoteMapOverlay(null);
    setVoteOptionNumberById(null);
    setCoordinatePickMode(null);
    coordinatePickModeRef.current = null;
    setPickCenter(null);
    setIsJournalOpen(false);
    setIsAchievementsOpen(false);
    setSelectedStoryDetail(null);
    snappedReplayEventRef.current = null;
    setReplayActive(false);
    setReplayPlayheadIndex(null);
    setReplayPaused(false);
    clearReplayResume(token);
    lastLiveTrailSampleRef.current = null;
  }, [tripDataResetNonce, stopFollowing, token]);

  function publishTravelerLocation(
    position: { lat: number; lon: number },
    accuracy?: number,
  ) {
    const last = lastSentLocationRef.current;
    const now = Date.now();
    const elapsed = last ? now - last.sentAt : Number.POSITIVE_INFINITY;
    const moved = !last ||
      Math.abs(position.lat - last.lat) > 0.0001 ||
      Math.abs(position.lon - last.lon) > 0.0001;
    if (last && elapsed < MIN_LOCATION_PUBLISH_INTERVAL_MS) return;
    if (last && !moved && elapsed < 30_000) return;

    lastSentLocationRef.current = {
      lat: position.lat,
      lon: position.lon,
      sentAt: now,
    };
    updateTravelerLocation({
      token,
      lat: position.lat,
      lon: position.lon,
      accuracy,
    }).catch(() => {});
  }

  function publishLiveTrailSample(
    position: { lat: number; lon: number },
    accuracy?: number,
  ) {
    const last = lastLiveTrailSampleRef.current;
    const now = Date.now();
    const elapsed = last ? now - last.sentAt : Number.POSITIVE_INFINITY;
    const movedMeters = last ? distanceMeters(last, position) : Number.POSITIVE_INFINITY;
    if (last && movedMeters < LIVE_TRAIL_MIN_DISTANCE_METERS && elapsed < LIVE_TRAIL_MIN_INTERVAL_MS) {
      return;
    }

    lastLiveTrailSampleRef.current = {
      lat: position.lat,
      lon: position.lon,
      sentAt: now,
    };
    recordLiveTrailSample({
      token,
      lat: position.lat,
      lon: position.lon,
      accuracy,
      sampledAt: now,
    }).catch((error) => {
      log.error("live-trail:sample:error", "mutation", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  function stopLocationSharing() {
    isLocationSharingRef.current = false;
    lastSentLocationRef.current = null;
    setIsLocationSharing(false);
    stopFollowing();
    stopTravelerLocationSharing({ token }).catch(() => {});
  }

  function handleNavigateToMessageItem(type: string, id: string) {
    music.sfx("page");
    setIsMessagingOpen(false);
    if (type === "mission") {
      handleNavigateToMissionDetail(id);
    } else if (type === "checkpoint") {
      const event = journalEvents.find((e) => e.checkpointId === id);
      if (event) {
        setSelectedStoryDetail({
          eventId: event._id,
          checkpointId: event.checkpointId,
          fallbackEvent: event,
        });
      }
    } else if (type === "route_vote") {
      handleNavigateToVote(id);
    } else if (type === "transaction") {
      openFunds({ source: "message:link", sourceLabel: "Message Link" });
    }
  }

  function handleToggleLocationSharing() {
    music.sfx("tap");
    if (isLocationSharing) {
      stopLocationSharing();
    } else {
      if (liveTrailEnabledRef.current) {
        liveTrailPermissionLoggedRef.current = false;
        log.logInteraction("live-trail:permission:request", {
          available: Boolean(navigator.geolocation),
        });
      }
      if (insideCloakingZoneRef.current) {
        showToast("You are currently in a cloaked zone.");
        return;
      }
      isLocationSharingRef.current = true;
      setIsLocationSharing(true);
      if (livePosition) {
        publishTravelerLocation(livePosition, livePosition.accuracy);
      }
    }
  }

  async function handleStartReplay() {
    stopFollowing();
    if (!canAttemptReplay) {
      log.logInteraction("replay:start:boundary", { reason: replayTrailLoading ? "loading" : "path-hidden" });
      showToast(replayTrailLoading ? "Trip Replay is loading breadcrumbs." : "Trip path is hidden.");
      return;
    }
    let nextTrailSamples: LiveTrailSample[];
    try {
      nextTrailSamples = await loadReplayTrailSamples();
    } catch {
      showToast("Trip Replay could not load breadcrumbs. Try again.");
      return;
    }
    const nextReplayPins = buildReplayPins(replayJournalEvents, nextTrailSamples);
    if (nextReplayPins.length <= 1) {
      log.logInteraction("replay:start:boundary", { reason: "no-coordinate-pins", trailSamples: nextTrailSamples.length });
      showToast("Trip Replay needs at least two located breadcrumbs or journal events.");
      return;
    }
    music.sfx("page");
    // Close any UI that the close-on-interaction effect would otherwise treat as
    // a reason to immediately close the replay we're about to start.
    setSelectedStoryDetail(null);
    setIsJournalOpen(false);
    setIsMessagingOpen(false);
    setIsTravelFundsSheetOpen(false);
    setIsVotePanelOpen(false);
    setIsTravelerStateOpen(false);
    setIsAchievementsOpen(false);
    setIsMissionsPanelOpen(false);
    setSelectedCloakingPin(null);
    setContextMenu(null);
    setStoryPrefill(null);
    snappedReplayEventRef.current = null;
    const resumeIndex = resolveReplayResumeIndex(token, nextReplayPins);
    setReplayActive(true);
    setReplayPlayheadIndex(resumeIndex);
    log.logInteraction("replay:start", {
      totalPins: nextReplayPins.length,
      trailSamples: nextTrailSamples.length,
      resumeIndex,
      speed: replaySpeed,
    });
  }

  function handleReplayScrub(index: number) {
    const nextIndex = Math.min(replayEndIndex, Math.max(0, Math.round(index)));
    setReplayPlayheadIndex(nextIndex);
    // Touching the timeline implies the user wants to dwell on a specific pin —
    // auto-pause so they aren't fighting the auto-advance.
    setReplayPaused(true);
    log.logInteraction("replay:timeline:scrub", {
      index: nextIndex,
      progress: replayEndIndex === 0 ? 100 : Math.round((nextIndex / replayEndIndex) * 100),
    });
  }

  function handleReplaySpeedChange(speed: number) {
    const nextSpeed = Math.min(16, Math.max(1, Math.round(speed)));
    setReplaySpeed((currentSpeed) => {
      if (currentSpeed !== nextSpeed) {
        log.logInteraction("replay:speed-shift", {
          fromSpeed: currentSpeed,
          toSpeed: nextSpeed,
        });
      }
      return nextSpeed;
    });
  }

  function handleReplayShuttleStart() {
    log.logInteraction("replay:shuttle:drag-start", { speed: replaySpeed });
  }

  function handleReplayShuttleEnd() {
    log.logInteraction("replay:shuttle:drag-end", { speed: replaySpeed });
  }

  function handleCloseReplay() {
    music.sfx("close");
    snappedReplayEventRef.current = null;
    setReplayActive(false);
    setReplayPlayheadIndex(null);
    setReplayPaused(false);
    log.logInteraction("replay:close", { speed: replaySpeed });
  }

  function handleToggleReplayPause() {
    setReplayPaused((prev) => {
      log.logInteraction(prev ? "replay:resume" : "replay:pause", {
        index: replayPlayheadIndex,
        speed: replaySpeed,
      });
      return !prev;
    });
  }

  function handleRestartReplay() {
    snappedReplayEventRef.current = null;
    setReplayPlayheadIndex(0);
    setReplayPaused(false);
    log.logInteraction("replay:restart", { speed: replaySpeed });
  }

  function handleRequestCoordinatePick(
    optionIndex: number,
    callback: (coord: { lat: number; lon: number }) => void,
    options?: CoordinatePickOptions,
  ) {
    log.logInteraction("coordinate:pick-mode:enter", {
      source: "route-vote",
      optionIndex,
      hasInitial: Boolean(options?.initialCoord),
    });
    music.sfx("page");
    const label = `Option ${optionIndex + 1} location`;
    const sheetSelector = "[data-role='route-votes-sheet']";
    const mode = { label, callback, sheetSelector, initialCoord: options?.initialCoord ?? null };
    coordinatePickModeRef.current = mode;
    setCoordinatePickMode(mode);
  }

  function disconnectSheetObserver() {
    sheetResizeObserverRef.current?.disconnect();
    sheetResizeObserverRef.current = null;
    if (sheetResizeDebounceRef.current) {
      clearTimeout(sheetResizeDebounceRef.current);
      sheetResizeDebounceRef.current = null;
    }
  }

  // Apply the active focus to the camera. Used both for the immediate move and
  // for the debounced re-apply once the sheet settles/resizes. Handles both a
  // "center a point" target and a "fit bounds" target with measured occluders.
  function applyActiveFocus(reason: "initial" | "resize") {
    const focus = activeFocusRef.current;
    const map = mapRef.current;
    if (!focus || !map) return;
    if (mapServiceUnavailableRef.current) {
      logMapEvent("map:camera:blocked", { trigger: focus.trigger });
      return;
    }
    // Sheet not mounted yet (fresh open) — skip; the ResizeObserver re-applies
    // once it appears. Do NOT clear here; close is owned by the no-sheet-open
    // effect, so clearing would drop a still-valid focus.
    if (focus.sheetSelector && !document.querySelector(focus.sheetSelector)) {
      return;
    }

    stopFollowing();

    if (focus.kind === "fit") {
      const padding = readOccluderPadding(map, {
        topOccluderEl: cardsWrapperRef.current,
        sheetSelector: focus.sheetSelector,
      });
      lastRecenterHeightRef.current = Math.max(0, padding.bottom - 24);
      log.logInteraction("map:camera:fitbounds", {
        trigger: focus.trigger,
        reason,
        sw: { lon: focus.bounds[0][0], lat: focus.bounds[0][1] },
        ne: { lon: focus.bounds[1][0], lat: focus.bounds[1][1] },
        padding,
      });
      pendingFocusRef.current = null;
      focusAdjustArmRef.current = null;
      map.fitBounds(focus.bounds, {
        padding,
        maxZoom: focus.maxZoom ?? 14,
        duration: focus.duration ?? 700,
      });
      return;
    }

    const geometry = readFocusGeometry(map, {
      topOccluderEl: cardsWrapperRef.current,
      sheetSelector: focus.sheetSelector,
      minZoom: focus.minZoom,
    });
    lastRecenterHeightRef.current = geometry.bottomOccluder?.h ?? 0;
    log.logMap("map:camera:focus", {
      trigger: focus.trigger,
      reason,
      lat: focus.coord.lat,
      lon: focus.coord.lon,
      viewport: geometry.viewport,
      topOccluder: geometry.topOccluder,
      bottomOccluder: geometry.bottomOccluder,
      band: geometry.band,
      target: geometry.target,
      anchor: geometry.anchor,
      padding: geometry.padding,
      zoom: geometry.zoom,
    });
    // Arm the settled-log (and teach window) for the resulting moveend.
    pendingFocusRef.current = {
      coord: focus.coord,
      trigger: focus.trigger,
      sheetSelector: focus.sheetSelector,
      minZoom: focus.minZoom,
      geometry,
    };
    focusAdjustArmRef.current = null;
    map.easeTo({
      center: [focus.coord.lon, focus.coord.lat],
      zoom: geometry.zoom,
      duration: focus.duration ?? 700,
      padding: geometry.padding,
    });
  }

  // Watch the active sheet so the pin recenters once it reaches final height
  // (animate-in) and whenever it changes size later (e.g. list <-> detail).
  function observeActiveSheet(sheetSelector: string | null) {
    disconnectSheetObserver();
    if (sheetSelector === null || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      const height = (document.querySelector(sheetSelector) as HTMLElement | null)?.offsetHeight ?? 0;
      // A collapsing sheet (animate-out on close) must never drive a recenter.
      if (height < SHEET_MIN_OPEN_PX) return;
      if (Math.abs(height - lastRecenterHeightRef.current) < SHEET_RESIZE_THRESHOLD_PX) return;
      // Debounce: collapse the burst of animate-in frames into one recenter.
      if (sheetResizeDebounceRef.current) clearTimeout(sheetResizeDebounceRef.current);
      sheetResizeDebounceRef.current = setTimeout(() => {
        sheetResizeDebounceRef.current = null;
        applyActiveFocus("resize");
      }, SHEET_RESIZE_DEBOUNCE_MS);
    });
    sheetResizeObserverRef.current = observer;

    // The element may not be mounted yet; poll a few frames for it to appear.
    const tryAttach = (attempt: number) => {
      if (sheetResizeObserverRef.current !== observer) return; // superseded
      const el = document.querySelector(sheetSelector);
      if (el) {
        observer.observe(el);
        return;
      }
      if (attempt < 30) requestAnimationFrame(() => tryAttach(attempt + 1));
    };
    tryAttach(0);
  }

  // Unified, measured focus: clamps the pin to the center of the visible band
  // between the status card and the active sheet, then logs the geometry so the
  // result is observable (see focusCoordinate.ts and docs/agents/debug-log.md).
  function focusCoordinate(
    coord: { lat: number; lon: number },
    opts: { trigger: string; sheetSelector: string | null; minZoom?: number; duration?: number },
  ) {
    stopFollowing();
    activeFocusRef.current = { kind: "center", coord, ...opts };
    lastRecenterHeightRef.current = -1;
    applyActiveFocus("initial"); // move now with best-available measurement
    observeActiveSheet(opts.sheetSelector); // then correct as the sheet settles
  }

  function handleNavigateToMission(coord: { lat: number; lon: number }) {
    focusCoordinate(coord, {
      trigger: "Mission:location-focus",
      sheetSelector: "[data-role='missions-sheet']",
    });
  }

  function handleNavigateToVote(voteId: string) {
    log.logInteraction("panel:navigate", { from: "Missions", to: "votes", voteId });
    music.sfx("page");
    setVotesDebugSource({ source: "missions:linked-vote", sourceLabel: "Missions -> Route Vote" });
    setIsMissionsPanelOpen(false);
    setIsVotePanelOpen(true);
    setIsJournalOpen(false);
    setIsTravelFundsSheetOpen(false);
    setIsAchievementsOpen(false);
    setPendingOpenVoteId(voteId);
  }

  function handleNavigateToMissionDetail(
    missionId: string,
    debugSource: DebugOpenSource = { source: "votes:linked-mission", sourceLabel: "Votes -> Mission" },
  ) {
    log.logInteraction("panel:navigate", { from: "votes", to: "Missions", missionId });
    music.sfx("page");
    setMissionsDebugSource(debugSource);
    setIsVotePanelOpen(false);
    setVoteMapOverlay(null);
    setVoteOptionNumberById(null);
    setIsMissionsPanelOpen(true);
    setIsJournalOpen(false);
    setIsTravelFundsSheetOpen(false);
    setIsAchievementsOpen(false);
    setIsMessagingOpen(false);
    setPendingOpenDetailMissionId(missionId);
  }

  function handleNavigateToMysteryMissionDetail(mysteryMissionId: string) {
    log.logInteraction("panel:navigate", { from: "map", to: "Missions", mysteryMissionId });
    music.sfx("page");
    setMissionsDebugSource({ source: "map:mystery-pin", sourceLabel: "Mystery Pin -> Missions" });
    setIsVotePanelOpen(false);
    setVoteMapOverlay(null);
    setVoteOptionNumberById(null);
    setIsMissionsPanelOpen(true);
    setIsJournalOpen(false);
    setIsTravelFundsSheetOpen(false);
    setIsAchievementsOpen(false);
    setIsMessagingOpen(false);
    setPendingOpenMysteryMissionId(mysteryMissionId);
  }

  function handleMysterySignalAppeared(mission: { lat: number; lon: number }) {
    focusCoordinate(
      { lat: mission.lat, lon: mission.lon },
      {
        trigger: "mystery:signal-appeared",
        sheetSelector: null,
        minZoom: 14,
      },
    );
  }

  function handleOpenLinkedStory(event: JournalEvent) {
    log.logInteraction("panel:navigate", { from: "Missions", to: "story", eventId: event._id });
    music.sfx("page");
    setStoryDebugSource({ source: "missions:linked-story", sourceLabel: "Missions -> Story" });
    setSelectedStoryDetail({
      eventId: event._id,
      checkpointId: event.checkpointId,
      fallbackEvent: event,
    });
  }

  function handleOpenMissionFromStory(missionId: string) {
    log.logInteraction("panel:navigate", { from: "story", to: "Missions", missionId });
    setSelectedStoryDetail(null);
    handleNavigateToMissionDetail(missionId, { source: "story-detail:mission", sourceLabel: "Story detail -> Mission" });
  }

  function handleNavigateStoryDetail(direction: StoryNavigationDirection) {
    if (!storyNavigation) {
      log.logInteraction("story:navigate:boundary", { direction, reason: "navigation-unavailable" });
      return;
    }
    const targetIndex =
      direction === "previous" ? storyNavigation.currentIndex - 1 : storyNavigation.currentIndex + 1;
    const target = storyNavigation.events[targetIndex];
    if (!target) {
      log.logInteraction("story:navigate:boundary", {
        direction,
        currentIndex: storyNavigation.currentIndex,
        total: storyNavigation.total,
      });
      return;
    }
    log.logInteraction("story:navigate:index-shift", {
      direction,
      fromIndex: storyNavigation.currentIndex,
      toIndex: targetIndex,
      total: storyNavigation.total,
      fromEventId: selectedStoryEvent?._id,
      toEventId: target._id,
    });
    music.sfx("page");
    setStoryDebugSource({
      source: `story-detail:${direction}`,
      sourceLabel: direction === "previous" ? "Story detail -> Previous" : "Story detail -> Next",
    });
    setSelectedStoryDetail({
      eventId: target._id,
      checkpointId: target.checkpointId,
      fallbackEvent: target,
    });
  }

  function handleRequestMissionCoordinatePick(
    callback: (coord: { lat: number; lon: number }) => void,
    options?: CoordinatePickOptions,
  ) {
    log.logInteraction("coordinate:pick-mode:enter", {
      source: "Mission",
      hasInitial: Boolean(options?.initialCoord),
    });
    music.sfx("page");
    const label = "Mission location";
    const sheetSelector = "[data-role='missions-sheet']";
    const mode = { label, callback, sheetSelector, initialCoord: options?.initialCoord ?? null };
    coordinatePickModeRef.current = mode;
    setCoordinatePickMode(mode);
  }

  function handleRequestStoryCoordinatePick(
    callback: (coord: { lat: number; lon: number }) => void,
    options?: CoordinatePickOptions,
  ) {
    log.logInteraction("coordinate:pick-mode:enter", {
      source: "Story",
      hasInitial: Boolean(options?.initialCoord),
    });
    music.sfx("page");
    const label = "Story location";
    const sheetSelector = "[data-role='journal-sheet']";
    const mode = { label, callback, sheetSelector, initialCoord: options?.initialCoord ?? null };
    coordinatePickModeRef.current = mode;
    setCoordinatePickMode(mode);
  }

  function handleVoteOverlayChange(
    overlay: RouteVoteMapOverlayType | null,
    optionNumberById?: Record<string, number> | null,
  ) {
    setVoteMapOverlay(overlay);
    setVoteOptionNumberById(optionNumberById ?? null);
  }

  // NOTE: the activity-complete-as-checkin flow (handleCompleteAsCheckIn +
  // handleCheckpointCreated + activityToComplete state) was removed when the
  // CurrentActivityCard came out with the legacy chrome. The Mission
  // Complete-as-Story flow below (Part 8) replaces it for the mission case;
  // an explicit "complete this freeform activity as a Story" flow can be
  // re-added in a later pass if Current Activity expands beyond status entry.

  function handleCompleteAsStory(Mission: {
    _id: string;
    status?: string;
    source?: string;
    title?: string;
    description?: string;
    locationLabel?: string;
    lat?: number;
    lon?: number;
  }) {
    music.sfx("page");
    setCheckInDebugSource({ source: "missions:complete-as-story", sourceLabel: "Mission detail -> Complete as Story" });
    setIsMissionsPanelOpen(false);
    setStoryPrefill({
      missionId: Mission._id,
      completeMission: Mission.status === "in_progress",
      mysteryReveal: Mission.source === "mystery",
      title: Mission.title,
      note: Mission.description,
      locationLabel: Mission.locationLabel,
    });
    // Remember which mission to land on if the Traveler backs out of the story
    // form — the MissionPanel re-opens directly on this detail view.
    setPendingOpenDetailMissionId(Mission._id);
    if (Mission.lat !== undefined && Mission.lon !== undefined) {
      setSelectedCoordinate({
        lat: Mission.lat,
        lon: Mission.lon,
        source: "current_activity",
      });
    } else {
      // Mission has no location yet — drop the Traveler into placement mode so
      // they can tap where the story actually happened.
      setIsPlacementMode(true);
      showToast("Tap the map where the mission wrapped up.");
    }
  }

  function handleBackFromStory() {
    music.sfx("page");
    // "← Back" inside AddCheckpointSheet's mission-completion mode: dismiss
    // the story form (clears prefill + coordinate), then re-open the missions
    // panel; MissionPanel reads `pendingOpenDetailMissionId` and lands on
    // the originating mission's detail view (the full four-button set).
    setStoryPrefill(null);
    setSelectedCoordinate(null);
    setIsPlacementMode(false);
    setMissionsDebugSource({ source: "story-form:back", sourceLabel: "Back button" });
    setIsMissionsPanelOpen(true);
  }

  function handleStoryCheckpointCreated(_id: string, prefill?: CheckpointPrefill) {
    setStoryPrefill(null);
    setPendingOpenDetailMissionId(null);
    if (prefill?.completeMission) {
      music.sfx("success");
      showToast(prefill.mysteryReveal ? "Mystery Mission revealed." : "Mission completed.", prefill.mysteryReveal ? "mystery" : "default");
    } else if (prefill?.missionId) {
      music.sfx("success");
      showToast("Story added to mission.");
    }
  }


  function startFollowingTraveler(coordinate: { lat: number; lon: number }) {
    pendingFocusRef.current = null;
    focusAdjustArmRef.current = null;
    setIsFollowing(true);
    centerMapOnCoordinate(coordinate);
  }

  function handleHistoryLocationFocus(coordinate: { lat: number; lon: number }) {
    focusCoordinate(coordinate, {
      trigger: "journal:location-focus",
      sheetSelector: "[data-role='journal-sheet']",
    });
  }

  function handleStoryDetailLocationFocus(coordinate: { lat: number; lon: number }) {
    focusCoordinate(coordinate, {
      trigger: "story-detail:location-focus",
      sheetSelector: "[data-role='story-detail']",
    });
  }


  function handleCenterLocation() {
    music.sfx("tap");
    const currentLocation =
      role === "traveler"
        ? (livePosition ?? storedTravelerLocation ?? null)
        : (storedTravelerLocation ?? null);

    if (currentLocation) {
      startFollowingTraveler(currentLocation);
      return;
    }

    stopFollowing();
    const lastCheckpoint = checkpoints[checkpoints.length - 1];
    if (lastCheckpoint?.lat !== undefined && lastCheckpoint.lon !== undefined) {
      centerMapOnCoordinate(lastCheckpoint as { lat: number; lon: number });
      return;
    }

    showToast("Traveler location is unknown.");
  }

  // Fit the route-vote points (origin + options) into the visible band. Joins
  // the focus machinery so padding is measured from the real sheet/card and the
  // fit re-applies once the sheet settles (and clears on close).
  function handleRequestFitMap(bounds: [[number, number], [number, number]] | null) {
    stopFollowing();
    if (!bounds || !isFiniteLngLatBounds(bounds)) {
      if (activeFocusRef.current?.kind === "fit") {
        activeFocusRef.current = null;
        disconnectSheetObserver();
      }
      return;
    }
    activeFocusRef.current = {
      kind: "fit",
      bounds,
      trigger: "route-vote",
      sheetSelector: "[data-role='route-votes-sheet']",
      maxZoom: 14,
    };
    lastRecenterHeightRef.current = -1;
    applyActiveFocus("initial");
    observeActiveSheet("[data-role='route-votes-sheet']");
  }

  const mapClassName = useMemo(
    () =>
      isPlacementMode || coordinatePickMode
        ? "h-full min-h-[420px] w-full cursor-crosshair"
        : "h-full min-h-[420px] w-full",
    [isPlacementMode, coordinatePickMode],
  );

  const isPickingCoordinate = coordinatePickMode !== null;
  const mapCooldownMinutesRemaining = mapCooldownUntil
    ? Math.max(1, Math.ceil((mapCooldownUntil - Date.now()) / 60_000))
    : null;
  const showMapErrorBanner = (isMapServiceUnavailable || mapStyleError !== null) && !mapErrorDismissed;
  // The config hint is diagnostic detail, so it is shown only to the Traveler
  // with debug logging enabled. Everyone else sees the generic banner.
  const showMapDiagnosticDetail = role === "traveler" && isEnabled();
  // Re-show the banner when the underlying failure changes, even if a prior
  // instance was dismissed.
  const mapErrorSignature = `${mapCooldownUntil ?? ""}|${mapStyleUrl ? "" : "noproxy"}|${mapStyleError?.status ?? ""}`;
  useEffect(() => {
    setMapErrorDismissed(false);
  }, [mapErrorSignature]);

  const latestCheckpoint = checkpoints.at(-1) ?? null;
  const latestCheckpointLat = latestCheckpoint?.lat;
  const latestCheckpointLon = latestCheckpoint?.lon;
  const routeVoteFallbackOrigin = useMemo(() => {
    if (role === "traveler" && isFiniteRouteCoordinate(livePosition)) {
      return livePosition;
    }
    if (
      typeof latestCheckpointLat === "number" &&
      Number.isFinite(latestCheckpointLat) &&
      typeof latestCheckpointLon === "number" &&
      Number.isFinite(latestCheckpointLon)
    ) {
      return { lat: latestCheckpointLat, lon: latestCheckpointLon };
    }
    return null;
  }, [latestCheckpointLat, latestCheckpointLon, livePosition, role]);

  return (
    <section className="relative min-h-0 flex-1 overflow-hidden" aria-label="Checkpoint map">
      <DesktopMapFrame
        isDesktop={isDesktop}
        activeDockTab={activeDockTab}
        onDockSelect={handleDockSelect}
        onAdd={handleDockAdd}
        fanOpen={fanOpen}
        role={role}
        badges={{
          journal: unreadCount,
          missions: missionBadgeCount,
          votes: hasUnseenVote ? 1 : 0,
          votesPulsing: hasUnseenVote,
          messaging: visibleMessagingUnread,
          messagingPulsing: visibleMessagingUnread > 0,
        }}
        addLabel={role === "traveler" ? "Add" : `Propose ${TERMS.mission.toLowerCase()}`}
        showAdd={role === "traveler"}
        showAchievements
      >
      <div ref={mapContainerRef} className={mapClassName} />

      {/* Side-effect marker components */}
      <PreviewPinMarker map={mapInstance} coord={previewCoord} />
      <CheckpointMarkers
        map={mapInstance}
        checkpoints={checkpoints}
        onCheckpointClick={(checkpoint) => {
          if (isPlacementMode || coordinatePickMode) return;
          const event = journalEvents.find((e) => e.checkpointId === checkpoint._id);
          if (!event) return;
          music.sfx("page");
          setStoryOpenedFromJournal(false);
          setStoryDebugSource({ source: "story-pin", sourceLabel: "Story Pin" });
          setSelectedStoryDetail({
            eventId: event._id,
            checkpointId: event.checkpointId,
            fallbackEvent: event,
          });
        }}
      />
      <AccuracyCircle
        map={mapInstance}
        position={
          role === "traveler"
            ? livePosition
            : (storedTravelerLocation ?? null)
        }
        isVisible={role === "traveler" || (storedTravelerLocation?.isSharing ?? false)}
        color={
          role === "traveler"
            ? (isLocationSharing ? gpsPulseColor : "#102a43")
            : gpsPulseColor
        }
      />
      <TravelerLocationMarker
        map={mapInstance}
        isPulsing={
          role === "traveler" ? isLocationSharing : storedTravelerLocation !== null
        }
        position={
          role === "traveler"
            ? livePosition
            : (storedTravelerLocation ?? null)
        }
      />
      <RouteVoteMapOverlay
        key={tripDataResetNonce}
        map={mapInstance}
        overlay={isVotePanelOpen ? voteMapOverlay : null}
        fallbackOrigin={routeVoteFallbackOrigin}
        optionNumberById={voteOptionNumberById}
      />
      <MysteryMissionMarkers
        map={mapInstance}
        token={token}
        debugShowAll={debugShowAllMysteryPins}
        onMysteryMissionClick={handleNavigateToMysteryMissionDetail}
        onMysterySignalAppeared={handleMysterySignalAppeared}
        onMysteryMissionReveal={() => {
          music.sfx("success");
          showToast("Mystery Mission revealed.", "mystery");
        }}
      />
      <MissionMarkers
        map={mapInstance}
        token={token}
        role={role}
        onMissionClick={(id) => {
          music.sfx("open");
          setIsMissionsPanelOpen(true);
          setIsAchievementsOpen(false);
          setPendingOpenMissionId(id);
        }}
      />

      {/* Placement / coordinate pick banners */}
      <AnimatePresence>
        {isPlacementMode && (
          <motion.div
            key="placement-banner"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" as const }}
            className="absolute left-1/2 top-4 z-[5] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-3 rounded-md bg-[var(--bg-card)] px-3 py-2.5 text-[var(--ink-1)] shadow-lg"
          >
            <span className="text-sm">Tap the map to place a pin.</span>
            <button
              type="button"
              className="rounded bg-[var(--meter-track)] px-2.5 py-1 text-sm font-medium text-[var(--ink-1)]"
              onClick={() => { log.logInteraction("placement:cancel"); setIsPlacementMode(false); }}
            >
              Cancel
            </button>
          </motion.div>
        )}

        {coordinatePickMode && (
          <motion.div
            key="coordinate-pick-helper"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" as const }}
            className="absolute left-1/2 top-4 z-[6] flex max-w-[calc(100%-24px)] -translate-x-1/2"
          >
            <MapPickerHelperBanner
              label={coordinatePickMode.label}
              lat={pickCenter?.lat ?? null}
              lon={pickCenter?.lon ?? null}
            />
          </motion.div>
        )}
        {coordinatePickMode && <MapPickerCrosshair key="coordinate-pick-crosshair" />}
        {coordinatePickMode && (
          <motion.div
            key="coordinate-pick-confirm"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" as const }}
            className="absolute bottom-[88px] left-1/2 z-[21] -translate-x-1/2"
          >
            <MapPickerConfirmPanel
              onCancel={cancelCoordinatePick}
              onConfirm={confirmCoordinatePick}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toastMessage && (
          <motion.div
            key="map-toast"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" as const }}
            role="status"
            className={cn(
              "absolute bottom-[112px] left-1/2 z-[6] max-w-[calc(100%-24px)] -translate-x-1/2 rounded-md px-4 py-2 text-sm font-medium shadow-lg",
              toastVariant === "mystery"
                ? "border border-zinc-500/60 bg-zinc-950 text-zinc-100"
                : "bg-[var(--bg-card)] text-[var(--ink-1)]",
            )}
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {replayActive && replayPlayheadIndex !== null ? (
          <TripReplayHud
            playheadIndex={replayPlayheadIndex}
            endIndex={replayEndIndex}
            currentPinKind={replayPlayheadIndex >= replayPins.length ? "end" : currentReplayPinKind}
            currentPinTime={currentReplayPin?.occurredAt ?? null}
            speed={replaySpeed}
            isPaused={replayPaused}
            onTogglePause={handleToggleReplayPause}
            onRestart={handleRestartReplay}
            onScrub={handleReplayScrub}
            onSpeedChange={handleReplaySpeedChange}
            onShuttleStart={handleReplayShuttleStart}
            onShuttleEnd={handleReplayShuttleEnd}
            onClose={handleCloseReplay}
          />
        ) : null}
      </AnimatePresence>

      <VoteTimeSplash
        token={token}
        enabled={role === "follower" && !isVotePanelOpen}
        onOpenVotes={openVotesFromSplash}
      />

      <AnimatePresence>
        {showMapErrorBanner ? (
          <motion.div
            key="map-service-unavailable"
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" as const }}
            role="alert"
            className="absolute left-1/2 top-4 z-[7] flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-col rounded-md border border-[var(--ink-danger)] bg-[var(--bg-danger)] py-2.5 pl-4 pr-9 text-sm font-medium text-[var(--ink-danger)] shadow-lg"
          >
            <button
              type="button"
              aria-label="Dismiss"
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded text-base leading-none opacity-70 hover:opacity-100"
              onClick={() => setMapErrorDismissed(true)}
            >
              ×
            </button>
            <span>{isMapServiceUnavailable ? "Map Service Unavailable" : "Basemap failed to load"}</span>
            <span className="text-xs font-normal opacity-85">
              {mapCooldownMinutesRemaining
                ? `It will attempt to resume in ${mapCooldownMinutesRemaining} min.`
                : !mapStyleUrl
                  ? "Map proxy is not configured."
                  : "The map background couldn't be loaded."}
            </span>
            {showMapDiagnosticDetail && mapProxyConfigHint ? (
              <span className="mt-1 text-[11px] font-normal leading-snug opacity-85">
                {mapProxyConfigHint}
              </span>
            ) : null}
            {mapCooldownUntil && role === "traveler" ? (
              <button
                type="button"
                className="mt-2 self-start rounded bg-[var(--bg-card)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-danger)]"
                onClick={handleMapTryAgain}
              >
                Try again
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {contextMenu && (
        <div
          className="absolute z-[100] min-w-[140px] rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] p-1 shadow-xl animate-in fade-in zoom-in-95 duration-100"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {role === "traveler" && (
            <button
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-[var(--bg-paper-2)] text-[var(--ink-1)]"
              onClick={(e) => {
                e.stopPropagation();
              log.logUi("map:context-menu:add-pin", { lat: contextMenu.lat, lon: contextMenu.lon });
                musicRef.current.sfx("pin");
                setCheckInDebugSource({ source: "map:context-menu", sourceLabel: "Context Menu -> Add Pin" });
                setSelectedCoordinate({
                  lat: contextMenu.lat,
                  lon: contextMenu.lon,
                  source: "right_click",
                });
                setContextMenu(null);
              }}
            >
              Add Pin
            </button>
          )}
          {role === "traveler" && (
            <button
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-[var(--bg-paper-2)] text-[var(--ink-1)]"
              onClick={() => {
                const defaultRadius = Number(
                  localStorage.getItem("tripcast.cloaking.defaultCloakingRadiusMeters") ?? "200",
                );
                addCloakingPin({ token, lat: contextMenu.lat, lon: contextMenu.lon, radiusMeters: defaultRadius }).catch(() => {});
                music.sfx("pin");
                log.logUi("map:context-menu:add-cloaking-zone", { lat: contextMenu.lat, lon: contextMenu.lon });
                setContextMenu(null);
              }}
            >
              Add Cloaking Zone
            </button>
          )}
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-[var(--bg-paper-2)] text-[var(--ink-1)]"
            onClick={(e) => {
              e.stopPropagation();
              const action = role === "traveler" ? "add-mission" : "propose-mission";
              log.logUi(`map:context-menu:${action}`, { 
                lat: contextMenu.lat, 
                lon: contextMenu.lon 
              });
              setMissionPrefillCoordinate({ lat: contextMenu.lat, lon: contextMenu.lon });
              forceOpenMissions({
                source: "map:context-menu",
                sourceLabel: role === "traveler" ? "Context Menu -> Add Mission" : "Context Menu -> Propose Mission",
              });
              setContextMenu(null);
            }}
          >
            {role === "traveler" ? "Add Mission" : "Propose Mission"}
          </button>
        </div>
      )}

      {/* Debug chip — only visible when debug logging is enabled */}
      {onOpenDebugPanel ? (
        <DebugChip onOpen={onOpenDebugPanel} />
      ) : null}

      {/* Calibration indicator — signals that map sheets won't dismiss on map interaction */}
      {calibration ? (
        <div
          className="pointer-events-none absolute left-3 top-12 z-[3] flex items-center gap-1.5 rounded-full bg-[var(--flag)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-on-dark)] shadow-[var(--shadow-card)]"
          role="status"
        >
          <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
          CALIBRATE
        </div>
      ) : null}

      {/* Map utility — center on traveler (replaces the LocateFixed FAB) */}
      <MapCenterButton
        className="absolute bottom-[118px] right-3 z-[2]"
        active={isFollowing}
        onClick={handleCenterLocation}
      />

      {/* Achievements sheet and queued toasts. The Dock owns the trigger. */}
      <FeatureBoundary
        resetKeys={[token, role, "achievements"]}
        title="Achievements hit a problem."
        message="Try again."
        fallbackClassName={CARD_ERROR_CLASS}
      >
        <AchievementsConnected
          token={token}
          open={isAchievementsOpen}
          onOpenChange={setIsAchievementsOpen}
          showButton={false}
        />
      </FeatureBoundary>

      {/* Bottom Dock */}
      <div className="pointer-events-none absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[20] tripcast-frame">
        <Dock
          active={activeDockTab}
          onSelect={handleDockSelect}
          onAdd={handleDockAdd}
          fanOpen={fanOpen}
          addLabel={role === "traveler" ? "Add" : `Propose ${TERMS.mission.toLowerCase()}`}
          showAdd={role === "traveler"}
          showFunds={false}
          showAchievements
          badges={{
            journal: unreadCount,
            missions: missionBadgeCount,
            votes: hasUnseenVote ? 1 : 0,
            votesPulsing: hasUnseenVote,
            messaging: visibleMessagingUnread,
            messagingPulsing: visibleMessagingUnread > 0,
          }}
        />
      </div>

      <FanMenu
        open={fanOpen && role === "traveler"}
        onClose={() => {
          music.sfx("close");
          setFanOpen(false);
        }}
        onPick={handleFanPick}
      />

      {/* Checkpoint add sheet */}
      {canWrite && (
        <ConvexCheckpointSheet
          selectedCoordinate={selectedCoordinate}
          token={token}
          onClose={() => {
            music.sfx("close");
            setSelectedCoordinate(null);
            setStoryPrefill(null);
            // Swipe-down / escape dismissal — drop the pending detail return
            // so a later unrelated open of the missions panel doesn't surprise
            // the Traveler by jumping to this mission's detail.
            setPendingOpenDetailMissionId(null);
          }}
          prefill={storyPrefill ?? undefined}
          onCheckpointCreated={handleStoryCheckpointCreated}
          onBack={storyPrefill?.missionId ? handleBackFromStory : undefined}
          debugSource={checkInDebugSource}
        />
      )}

      {/* Vote panels — kept mounted (not unmounted) during coordinate pick to
          preserve form state, and while closed so the close transition plays. */}
      <FeatureBoundary
        resetKeys={[isVotePanelOpen, role, token]}
        onClose={() => {
          music.sfx("close");
          setIsVotePanelOpen(false);
          setVoteMapOverlay(null);
          setVoteOptionNumberById(null);
        }}
        title={role === "traveler" ? "Route votes hit a problem." : "Votes hit a problem."}
        message="Try again, or close votes and reopen them."
        fallbackClassName={BOTTOM_SHEET_ERROR_CLASS}
      >
        <RouteVotePanel
          key={`${role}-vote-panel`}
          open={isVotePanelOpen}
          token={token}
          role={role}
          onClose={() => {
            music.sfx("close");
            setIsVotePanelOpen(false);
            setVoteMapOverlay(null);
            setVoteOptionNumberById(null);
          }}
          onRequestCoordinatePick={handleRequestCoordinatePick}
          onCoordinatePickSaved={clearPreviewPin}
          referenceLocation={livePosition}
          onVoteOverlayChange={handleVoteOverlayChange}
          onRequestFitMap={handleRequestFitMap}
          fallbackOrigin={routeVoteFallbackOrigin}
          isPickingCoordinate={isPickingCoordinate}
          pendingOpenVoteId={pendingOpenVoteId}
          onClearPendingVoteId={() => setPendingOpenVoteId(null)}
          onRequestOpenMissionDetail={handleNavigateToMissionDetail}
          debugSource={votesDebugSource}
        />
      </FeatureBoundary>

      <AnimatePresence>
        {role === "traveler" && isTravelerStateOpen && (
          <div className={isPickingCoordinate ? "invisible pointer-events-none" : undefined}>
            <FeatureBoundary
              resetKeys={[isTravelerStateOpen, token]}
              onClose={() => setIsTravelerStateOpen(false)}
              title="Traveler state hit a problem."
              message="Try again, or close state and reopen it."
              fallbackClassName={BOTTOM_SHEET_ERROR_CLASS}
            >
              <TravelerStateSheet
                token={token}
                onClose={() => {
                  music.sfx("close");
                  setIsTravelerStateOpen(false);
                }}
                onToast={showToast}
                debugSource={stateDebugSource}
              />
            </FeatureBoundary>
          </div>
        )}
      </AnimatePresence>

      <MessagingSheet
        open={isMessagingOpen}
        onOpenChange={(open) => {
          if (!open) {
            music.sfx("close");
            markMessagingRead();
          }
          setIsMessagingOpen(open);
        }}
        messages={messages}
        token={token}
        userId={currentUserId}
        sessionId={currentSessionId}
        role={role}
        lastReadAt={lastReadAt}
        onMarkRead={markMessagingRead}
        onNavigateToItem={handleNavigateToMessageItem}
      />

      <div
        ref={cardsWrapperRef}
        className={cn(
          "pointer-events-none absolute inset-x-3 top-3 z-[2] flex flex-col gap-2 tripcast-frame",
          coordinatePickMode && "invisible",
        )}
      >
        {locationStale ? (
          <button
            type="button"
            onClick={openNativeLocationSettings}
            className="pointer-events-auto rounded-md border border-[var(--ink-danger)] bg-[var(--bg-danger)] px-3 py-2 text-left text-xs font-semibold text-[var(--ink-danger)] shadow-[var(--shadow-card)]"
          >
            Live location hasn’t updated recently. Tap to check location access — or reinstall from
            Xcode if the app build has expired.
          </button>
        ) : null}
        <FeatureBoundary
          resetKeys={[token, role, "hud-status-card"]}
          title="Status card hit a problem."
          message="Try again."
          fallbackClassName={CARD_ERROR_CLASS}
        >
          <StatusCardConnected
            token={token}
            role={role}
            onOpenState={() => {
              music.sfx("open");
              setStateDebugSource({ source: "status-card:state", sourceLabel: "Status card" });
              setIsTravelerStateOpen(true);
            }}
          />
        </FeatureBoundary>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {role === "traveler" ? (
              <LivePill
                on={isLocationSharing}
                onToggle={handleToggleLocationSharing}
                trailEnabled={liveTrailEnabled}
                className="pointer-events-auto"
              />
            ) : null}
            <FeatureBoundary
              resetKeys={[token, role, "hud-funds-compact"]}
              title="Funds chip hit a problem."
              message="Try again."
              fallbackClassName={CARD_ERROR_CLASS}
            >
              <FundsCompactConnected
                token={token}
                role={role}
                onOpenSheet={role === "traveler" ? () => openFunds({ source: "funds-chip", sourceLabel: "Funds chip" }) : undefined}
                className="pointer-events-auto max-w-full"
              />
            </FeatureBoundary>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => void handleStartReplay()}
              disabled={!canAttemptReplay}
              aria-pressed={replayActive}
              className="pointer-events-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[var(--bg-card)] px-3 font-[var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-2)] shadow-[var(--shadow-card)] transition-colors hover:text-[var(--ink-1)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              {replayTrailLoading
                ? `Loading ${replayTrailLoad.samples}`
                : replayActive ? `${replaySpeed}x Replay` : "Replay"}
            </button>
            {replayTrailLoad.status === "error" ? (
              <p className="pointer-events-auto max-w-[12rem] rounded-md bg-[var(--bg-card)] px-2 py-1 text-right text-[10px] font-semibold text-[var(--ink-danger)] shadow-[var(--shadow-card)]">
                Replay breadcrumbs failed to load.
              </p>
            ) : null}
            <MusicMuteIndicator className="pointer-events-auto" />
          </div>
        </div>
      </div>

      <Sheet
        open={isTravelFundsSheetOpen}
        modal={false}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            music.sfx("close");
            setIsTravelFundsSheetOpen(false);
          }
        }}
      >
        <SheetContent
          side="bottom"
          showBackdrop={false}
          mapAdjacent
          className="z-[10] max-h-[78dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
          data-role="travel-funds-sheet"
        >
          <div aria-hidden="true" className="absolute left-0 right-0 top-0 h-1 rounded-t-xl" style={{ background: FUNDS_PERSONALITY.color }} />
          <div
            className="relative flex items-start justify-between gap-2 border-b border-[var(--line-soft)] px-4 pb-3 pt-2"
            style={{ background: `linear-gradient(180deg, ${FUNDS_PERSONALITY.bg} 0%, var(--bg-paper) 100%)` }}
          >
            {/* Overlay the theme-aware gradient variable to allow cancellation in Constellation */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-full bg-[var(--header-gradient)]" />
            
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--ink-on-brand)] shadow-sm"
                  style={{ background: FUNDS_PERSONALITY.color }}
                >
                  <DollarSign className="h-4 w-4" />
                </span>
                <SheetTitle className="font-[var(--font-display)] text-xl font-extrabold tracking-tight text-[var(--ink-1)]">
                  {TERMS.travelFunds}
                </SheetTitle>
              </div>
            </div>
            <SheetCloseButton aria-label={`Close ${TERMS.travelFunds.toLowerCase()}`} />
          </div>
          <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-4 pb-4 pt-3">
            {role === "traveler" && isTravelFundsSheetOpen && (
              <TravelFundsSheet
                token={token}
                onClose={() => {
                  music.sfx("close");
                  setIsTravelFundsSheetOpen(false);
                }}
                debugSource={fundsDebugSource}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={selectedCloakingPin !== null}
        modal={false}
        onOpenChange={(open) => {
          if (!open) {
            music.sfx("close");
            setSelectedCloakingPin(null);
          }
        }}
      >
        <SheetContent
          side="bottom"
          showBackdrop={false}
          mapAdjacent
          className="z-[10] max-h-[78dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
          data-role="cloaking-pin-sheet"
        >
          <SheetCloseButton aria-label="Close cloaking zone" />
          {selectedCloakingPin && (
            <CloakingPinSheet
              key={selectedCloakingPin._id}
              pin={selectedCloakingPin}
              token={token}
              onClose={() => { music.sfx("close"); setSelectedCloakingPin(null); }}
              onDeleted={() => { music.sfx("close"); setSelectedCloakingPin(null); }}
            />
          )}
        </SheetContent>
      </Sheet>

      <FeatureBoundary
        resetKeys={[isMissionsPanelOpen, token, role]}
        onClose={() => {
          music.sfx("close");
          setIsMissionsPanelOpen(false);
        }}
        title="Missions hit a problem."
        message="Try again, or close missions and reopen them."
        fallbackClassName={BOTTOM_SHEET_ERROR_CLASS}
      >
        <MissionPanel
          open={isMissionsPanelOpen}
          token={token}
          role={role}
          onClose={() => {
            music.sfx("close");
            setIsMissionsPanelOpen(false);
          }}
          onStartMission={() => {
            music.sfx("success");
            setIsMissionsPanelOpen(false);
          }}
          onRequestCoordinatePick={handleRequestMissionCoordinatePick}
          onCoordinatePickSaved={clearPreviewPin}
          isPickingCoordinate={isPickingCoordinate}
          pendingOpenMissionId={pendingOpenMissionId}
          pendingOpenMysteryMissionId={pendingOpenMysteryMissionId}
          onClearPendingMission={() => setPendingOpenMissionId(null)}
          onClearPendingMysteryMission={() => setPendingOpenMysteryMissionId(null)}
          onRequestNavigateToMission={handleNavigateToMission}
          onCompleteAsStory={handleCompleteAsStory}
          onMysteryMissionReveal={() => {
            music.sfx("success");
            showToast("Mystery Mission revealed.", "mystery");
          }}
          pendingOpenDetailMissionId={pendingOpenDetailMissionId}
          prefilledCoordinate={missionPrefillCoordinate}
          onClearPrefill={() => setMissionPrefillCoordinate(null)}
          onClearPendingDetail={() => setPendingOpenDetailMissionId(null)}
          onRequestNavigateToVote={handleNavigateToVote}
          onOpenLinkedStory={handleOpenLinkedStory}
          onDetailOpenChange={setIsMissionDetailOpen}
          debugSource={missionsDebugSource}
        />
      </FeatureBoundary>

      <FeatureBoundary
        resetKeys={[isJournalOpen, journalEvents.length]}
        onClose={() => {
          music.sfx("close");
          setIsJournalOpen(false);
        }}
        title="Journal hit a problem."
        message="Try again, or close journal and reopen it."
        fallbackClassName={BOTTOM_SHEET_ERROR_CLASS}
      >
            <JournalSheet
              open={isJournalOpen}
              events={journalEvents}
              token={token}
              role={role}
              onClose={() => {
                music.sfx("close");
                setIsJournalOpen(false);
              }}
              onStorySelect={(event) => {
                music.sfx("page");
                setIsJournalOpen(false);
                setStoryOpenedFromJournal(true);
                setStoryDebugSource({ source: "journal:story-select", sourceLabel: "Journal -> Story" });
                setSelectedStoryDetail({
                  eventId: event._id,
                  checkpointId: event.checkpointId,
                  fallbackEvent: event,
                });
              }}
              onLocationFocus={handleHistoryLocationFocus}
              onMarkAllRead={markAllRead}
              onRequestCoordinatePick={handleRequestStoryCoordinatePick}
              onCoordinatePickSaved={clearPreviewPin}
              isPickingCoordinate={isPickingCoordinate}
              debugSource={journalDebugSource}
            />
      </FeatureBoundary>

      <StoryDetailSheet
        event={selectedStoryEvent}
        token={token}
        role={role}
        onClose={() => {
          music.sfx(storyOpenedFromJournal ? "page" : "close");
          const returnToJournal = storyOpenedFromJournal;
          setSelectedStoryDetail(null);
          setStoryOpenedFromJournal(false);
          if (returnToJournal) setIsJournalOpen(true);
        }}
        onLocationFocus={handleStoryDetailLocationFocus}
        missionTitle={
          selectedStoryEvent?.missionId
            ? (missionsForLookup ?? []).find((c) => c._id === selectedStoryEvent.missionId)?.title
            : undefined
        }
        missionId={selectedStoryEvent?.missionId ?? undefined}
        onNavigateToMission={handleOpenMissionFromStory}
        onRequestCoordinatePick={handleRequestStoryCoordinatePick}
        isPickingCoordinate={isPickingCoordinate}
        navigation={
          storyNavigation
            ? {
                currentIndex: storyNavigation.currentIndex,
                total: storyNavigation.total,
                hasPrevious: storyNavigation.hasPrevious,
                hasNext: storyNavigation.hasNext,
              }
            : null
        }
        onNavigateStory={handleNavigateStoryDetail}
        debugSource={storyDebugSource}
      />

      </DesktopMapFrame>
    </section>
  );
}

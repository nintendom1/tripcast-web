// Shared map-focus geometry: where should a focused pin land, and where did it
// actually land? All map-linked focus triggers (mission / journal / story /
// replay) route through this so they measure the occluding overlays the same
// way and produce one observable, tunable result.
//
// Model: the map is occluded by a status card at the top and (usually) a bottom
// sheet. The un-occluded vertical "band" between them is where a focused pin
// should sit. We clamp the pin to the CENTER of that band (ANCHOR below), then
// translate that target screen point into MapLibre camera padding.

import type { Map as MapLibreMap } from "maplibre-gl";

/** The single tuning point for "where in the band the pin should rest." */
export const ANCHOR = { x: 0.5, y: 0.5 } as const;

/** Breathing room (px) kept between the pin and the overlay edges. */
const DEFAULT_MARGIN = 16;
/** Never let the usable band collapse below this (px). */
const MIN_BAND_HEIGHT = 80;
/** Default zoom floor: focusing only zooms IN to here when zoomed out past it. */
const FOCUS_MIN_ZOOM = 14;

type Rect = { top: number; left: number; width: number; height: number };

export type FocusGeometry = {
  viewport: { w: number; h: number };
  topOccluder: { h: number } | null;
  bottomOccluder: { h: number; source: string } | null;
  /** Un-occluded vertical band, map-local px. */
  band: { top: number; height: number };
  /** Desired pin screen point, map-local px. */
  target: { x: number; y: number };
  anchor: { x: number; y: number };
  padding: { top: number; right: number; bottom: number; left: number };
  zoom: number;
};

export type SolveInput = {
  mapRect: { width: number; height: number };
  /** Status-card bottom edge, px from map top. null = no top overlay. */
  topOccluderBottom: number | null;
  /** Bottom-sheet top edge, px from map top. null = no bottom overlay. */
  bottomOccluderTop: number | null;
  bottomOccluderSource?: string;
  /** Current map zoom; focus only zooms IN, never out. */
  currentZoom?: number;
  /** Zoom floor — focusing bumps zoom up to here only when below it. */
  minZoom?: number;
  anchor?: { x: number; y: number };
  marginPx?: number;
};

/**
 * Pure, testable core: given the map size and the two occluder edges, compute
 * the band, the target screen point (clamped to band center), the MapLibre
 * padding that lands the coord there, and a band-aware zoom.
 */
export function solveFocusPadding(input: SolveInput): FocusGeometry {
  const { width: W, height: H } = input.mapRect;
  const margin = input.marginPx ?? DEFAULT_MARGIN;
  const anchor = input.anchor ?? ANCHOR;

  const topBottom = input.topOccluderBottom ?? 0;
  const sheetTop = input.bottomOccluderTop ?? H;

  // Band between the overlays, kept at least MIN_BAND_HEIGHT tall.
  let bandTop = topBottom + margin;
  let bandEnd = sheetTop - margin;
  if (bandEnd - bandTop < MIN_BAND_HEIGHT) {
    // Center whatever room exists and force the minimum height.
    const mid = (bandTop + bandEnd) / 2;
    bandTop = mid - MIN_BAND_HEIGHT / 2;
    bandEnd = mid + MIN_BAND_HEIGHT / 2;
  }
  const bandHeight = bandEnd - bandTop;

  const target = {
    x: W * anchor.x,
    y: bandTop + bandHeight * anchor.y,
  };

  // MapLibre centers `coord` at the center of the viewport inset by padding:
  //   centerX = (left + (W - right)) / 2  ->  left - right = 2*targetX - W
  //   centerY = (top + (H - bottom)) / 2  ->  top - bottom = 2*targetY - H
  // Pin the smaller side at `margin` and solve the other.
  const dx = 2 * target.x - W;
  const dy = 2 * target.y - H;
  const left = Math.max(0, dx > 0 ? margin + dx : margin);
  const right = Math.max(0, dx > 0 ? margin : margin - dx);
  const top = Math.max(0, dy > 0 ? margin + dy : margin);
  const bottom = Math.max(0, dy > 0 ? margin : margin - dy);

  // Zoom only IN when zoomed out past the floor; never zoom out on focus.
  const floor = input.minZoom ?? FOCUS_MIN_ZOOM;
  const zoom = input.currentZoom !== undefined ? Math.max(input.currentZoom, floor) : floor;

  return {
    viewport: { w: Math.round(W), h: Math.round(H) },
    topOccluder: input.topOccluderBottom !== null ? { h: Math.round(topBottom) } : null,
    bottomOccluder:
      input.bottomOccluderTop !== null
        ? { h: Math.round(H - sheetTop), source: input.bottomOccluderSource ?? "sheet" }
        : null,
    band: { top: Math.round(bandTop), height: Math.round(bandHeight) },
    target: { x: Math.round(target.x), y: Math.round(target.y) },
    anchor,
    padding: {
      top: Math.round(top),
      right: Math.round(right),
      bottom: Math.round(bottom),
      left: Math.round(left),
    },
    zoom: Number(zoom.toFixed(2)),
  };
}

function rectFromEl(el: Element | null): Rect | null {
  if (!(el instanceof HTMLElement)) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export type ReadGeometryOptions = {
  /** Status-card wrapper element (top overlay). */
  topOccluderEl: Element | null;
  /** Active bottom sheet selector, e.g. "[data-role='missions-sheet']". null = none. */
  sheetSelector: string | null;
  minZoom?: number;
  anchor?: { x: number; y: number };
};

/**
 * DOM wrapper: measure the live overlays against the map container and solve.
 * Returns the full geometry, used for both the camera move and its log payload.
 */
export function readFocusGeometry(map: MapLibreMap, opts: ReadGeometryOptions): FocusGeometry {
  const container = map.getContainer();
  const mapRect = container.getBoundingClientRect();

  const topRect = rectFromEl(opts.topOccluderEl);
  const topOccluderBottom = topRect ? topRect.top - mapRect.top + topRect.height : null;

  const sheetEl = opts.sheetSelector ? document.querySelector(opts.sheetSelector) : null;
  const sheetRect = rectFromEl(sheetEl);
  const bottomOccluderTop = sheetRect ? sheetRect.top - mapRect.top : null;

  return solveFocusPadding({
    mapRect: { width: mapRect.width, height: mapRect.height },
    topOccluderBottom,
    bottomOccluderTop,
    bottomOccluderSource: opts.sheetSelector ?? undefined,
    currentZoom: map.getZoom(),
    minZoom: opts.minZoom,
    anchor: opts.anchor,
  });
}

/**
 * Visible-region insets for `fitBounds`: padding that keeps content out from
 * under the status card (top) and the active sheet (bottom). Same occluder
 * measurement as readFocusGeometry, but returns raw insets (no point bias).
 */
export function readOccluderPadding(
  map: MapLibreMap,
  opts: { topOccluderEl: Element | null; sheetSelector: string | null; marginPx?: number },
): { top: number; right: number; bottom: number; left: number } {
  const margin = opts.marginPx ?? 24;
  const container = map.getContainer();
  const mapRect = container.getBoundingClientRect();

  const topRect = rectFromEl(opts.topOccluderEl);
  const topOccluderBottom = topRect ? topRect.top - mapRect.top + topRect.height : 0;

  const sheetEl = opts.sheetSelector ? document.querySelector(opts.sheetSelector) : null;
  const sheetRect = rectFromEl(sheetEl);
  const sheetHeight = sheetRect ? mapRect.height - (sheetRect.top - mapRect.top) : 0;

  return {
    top: Math.round(Math.max(0, topOccluderBottom) + margin),
    right: margin,
    bottom: Math.round(Math.max(0, sheetHeight) + margin),
    left: margin,
  };
}

/**
 * Where a screen point lands relative to the band, as 0..1 fractions.
 * x is fraction of full width; y is fraction down the band (0 = band top).
 * Ideal focus result ≈ { x: 0.5, y: 0.5 }.
 */
export function bandFractionOf(
  screen: { x: number; y: number },
  geometry: FocusGeometry,
): { x: number; y: number } {
  const x = geometry.viewport.w > 0 ? screen.x / geometry.viewport.w : 0;
  const y = geometry.band.height > 0 ? (screen.y - geometry.band.top) / geometry.band.height : 0;
  return { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) };
}

/** True when the screen point falls behind the top card or the bottom sheet. */
export function isOccluded(screen: { x: number; y: number }, geometry: FocusGeometry): boolean {
  const topBottom = geometry.topOccluder ? geometry.topOccluder.h : 0;
  const sheetTop = geometry.bottomOccluder
    ? geometry.viewport.h - geometry.bottomOccluder.h
    : geometry.viewport.h;
  return screen.y < topBottom || screen.y > sheetTop;
}

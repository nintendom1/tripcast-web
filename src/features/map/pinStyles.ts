/**
 * Shared pin + path styling tokens for the map rework.
 *
 * The map currently uses MapLibre's default circle/dot markers. Part 7 swaps
 * those for the teardrop-with-icon pins below; for now this module is the
 * single source of truth for the values so subsequent parts don't re-derive
 * colors and dash patterns.
 *
 * Mirrors the handoff intent: one teardrop shape across all pin kinds, the
 * icon inside the pin varies by kind, story check-ins gain a halo, and the
 * traveler path is a dashed/dotted line in a lighter weight.
 */

export type PinKind =
  | "checkin"
  | "story"
  | "mission"
  | "missionProgress"
  | "vote"
  | "current";

/**
 * Pin fill color by kind. Values are CSS custom properties from the Trail
 * palette so changes in `styles.css` propagate.
 */
export const PIN_COLORS: Record<PinKind, string> = {
  checkin: "var(--ink-1)",
  story: "var(--amber)",
  mission: "var(--plum)",
  missionProgress: "var(--flag)",
  vote: "var(--teal)",
  current: "var(--flag)",
};

/**
 * Halo (outer ring) color by kind. Story check-ins use a glowing amber halo
 * per the design; other kinds use no halo by default.
 */
export const PIN_HALOS: Partial<Record<PinKind, string>> = {
  story: "color-mix(in oklab, var(--amber) 35%, transparent)",
  current: "color-mix(in oklab, var(--flag) 30%, transparent)",
};

/**
 * Teardrop SVG path data. Used by Marker DOM elements and by tests.
 *
 * Designed in a 24x32 viewbox: width 24px at the shoulder, 32px tall, point
 * at the bottom center.
 */
export const PIN_TEARDROP_PATH =
  "M12 0C5.4 0 0 5.2 0 11.6c0 8.7 12 20.4 12 20.4s12-11.7 12-20.4C24 5.2 18.6 0 12 0Z";

export const PIN_VIEWBOX = "0 0 24 32";

/**
 * MapLibre `line-dasharray` for the traveler path. Lighter weight + dashes
 * read as "trail" rather than "route highlight".
 */
export const PATH_DASHARRAY: [number, number] = [2, 2];

export const PATH_WIDTH = 2.5;

export const PATH_COLOR = "var(--ink-1)";

/**
 * Renders a teardrop pin as an inline SVG marker element.
 *
 * Returns a `<svg>` element ready to hand to `new maplibregl.Marker({ element })`.
 * Pass an `iconSvg` string (e.g. an inlined Lucide icon) to render an icon
 * inside the pin's circle.
 */
export interface BuildPinMarkerOptions {
  kind: PinKind;
  iconSvg?: string;
  size?: number;
  ariaLabel?: string;
}

export function buildPinMarkerSvg({
  kind,
  iconSvg,
  size = 36,
  ariaLabel,
}: BuildPinMarkerOptions): string {
  const fill = PIN_COLORS[kind] ?? PIN_COLORS.checkin;
  const halo = PIN_HALOS[kind];
  const width = size;
  const height = Math.round((size * 32) / 24);
  const haloRect = halo
    ? `<circle cx="12" cy="11.6" r="13" fill="${halo}" />`
    : "";
  const inner = iconSvg
    ? `<g transform="translate(7 6.5) scale(0.42)" fill="#fff" stroke="#fff">${iconSvg}</g>`
    : `<circle cx="12" cy="11.6" r="4" fill="#fff" />`;
  const label = ariaLabel
    ? `<title>${ariaLabel}</title>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${PIN_VIEWBOX}" role="img">${label}${haloRect}<path d="${PIN_TEARDROP_PATH}" fill="${fill}" /><circle cx="12" cy="11.6" r="6" fill="rgba(255,255,255,0.18)" />${inner}</svg>`;
}

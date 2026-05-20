import * as React from "react";

/**
 * Pixel character palette — keys map to CSS variables from the Trail design
 * tokens so the sprite recolors automatically with the rest of the theme.
 */
const PALETTE: Record<string, string> = {
  skin: "var(--flag)",
  hair: "var(--ink-1)",
  shirt: "var(--green)",
  pants: "var(--ink-1)",
  shoe: "var(--ink-1)",
  pack: "var(--amber)",
  white: "#fff",
  eye: "var(--ink-1)",
  flag: "var(--flag)",
};

type Pixel = readonly [x: number, y: number, paletteKey: string];

/**
 * Explorer character — the default greeter for the Follower landing tour.
 * 12x16 grid, one frame, sprite-style. Ported from
 * tripcast-claude-design-handoff-temp/project/src/pixel-char.jsx.
 */
const EXPLORER_IDLE: ReadonlyArray<Pixel> = [
  // hair
  [4, 1, "hair"], [5, 1, "hair"], [6, 1, "hair"], [7, 1, "hair"],
  [3, 2, "hair"], [8, 2, "hair"],
  // face row 1
  [3, 3, "skin"], [4, 3, "skin"], [5, 3, "skin"], [6, 3, "skin"], [7, 3, "skin"], [8, 3, "skin"],
  // eyes row
  [3, 4, "skin"], [4, 4, "eye"], [5, 4, "skin"], [6, 4, "skin"], [7, 4, "eye"], [8, 4, "skin"],
  // chin row
  [3, 5, "skin"], [4, 5, "skin"], [5, 5, "skin"], [6, 5, "skin"], [7, 5, "skin"], [8, 5, "skin"],
  // neck
  [4, 6, "skin"], [5, 6, "skin"], [6, 6, "skin"], [7, 6, "skin"],
  // shirt + shoulders
  [2, 7, "shirt"], [3, 7, "shirt"], [4, 7, "shirt"], [5, 7, "shirt"], [6, 7, "shirt"], [7, 7, "shirt"], [8, 7, "shirt"], [9, 7, "shirt"],
  [3, 8, "shirt"], [4, 8, "shirt"], [5, 8, "shirt"], [6, 8, "shirt"], [7, 8, "shirt"], [8, 8, "shirt"],
  [3, 9, "shirt"], [4, 9, "shirt"], [5, 9, "shirt"], [6, 9, "shirt"], [7, 9, "shirt"], [8, 9, "shirt"],
  // backpack
  [9, 8, "pack"], [9, 9, "pack"],
  // pants
  [4, 10, "pants"], [5, 10, "pants"], [6, 10, "pants"], [7, 10, "pants"],
  [4, 11, "pants"], [5, 11, "pants"], [6, 11, "pants"], [7, 11, "pants"],
  // shoes
  [3, 12, "shoe"], [4, 12, "shoe"], [7, 12, "shoe"], [8, 12, "shoe"],
];

export type PixelCharVariant = "explorer";

export interface PixelCharProps {
  /** Sprite to render. Today only `explorer` is implemented — others ride with a future polish pass. */
  variant?: PixelCharVariant;
  /** Pixel-width of the rendered sprite. Height scales to 4:3 aspect. */
  size?: number;
  /** When true, suppresses the idle bob animation (handy for static previews). */
  static?: boolean;
  className?: string;
}

const FRAMES: Record<PixelCharVariant, ReadonlyArray<Pixel>> = {
  explorer: EXPLORER_IDLE,
};

/**
 * Pixel-art greeter rendered as an inline SVG of 1×1 rects. The whole sprite
 * does a gentle vertical bob in idle state — defined in `styles.css` keyframes
 * `tripcast-pixel-bob`. Marked `aria-hidden`; the surrounding component owns
 * any narrative copy that screen readers should hear.
 */
export function PixelChar({
  variant = "explorer",
  size = 96,
  static: staticOnly = false,
  className,
}: PixelCharProps) {
  const frame = FRAMES[variant] ?? FRAMES.explorer;
  const height = Math.round(size * (16 / 12));
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        width: size,
        height,
        position: "relative",
        imageRendering: "pixelated",
      }}
    >
      <svg
        viewBox="0 0 12 16"
        width="100%"
        height="100%"
        shapeRendering="crispEdges"
        style={{
          animation: staticOnly ? "none" : "tripcast-pixel-bob 1.6s ease-in-out infinite",
        }}
      >
        <ellipse cx="6" cy="15.6" rx="3" ry="0.3" fill="rgba(0,0,0,0.18)" />
        {frame.map(([x, y, key], i) => (
          <rect key={i} x={x} y={y} width="1" height="1" fill={PALETTE[key] ?? key} />
        ))}
      </svg>
    </div>
  );
}

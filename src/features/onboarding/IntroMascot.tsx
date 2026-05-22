import * as React from "react";

type Pose = "idle" | "wave" | "point" | "cheer";

type IntroMascotProps = {
  pose?: Pose;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

const POSES: Record<Pose, string[]> = {
  idle: [
    "........................",
    ".........oooooo.........",
    ".......ooCCCCCCoo.......",
    "......oCCCCCCCCCCo......",
    ".....oCCCccccCCCCo......",
    ".....oCCCo.CC.oCCo......",
    "......oooHHHHHHoo.......",
    "......oHSSSSSSHo........",
    ".....oHSSEESEESSHo.......",
    ".....oHSSSSSSSSHo.......",
    "......oSSMSSSSSo........",
    ".......ooSSSSoo.........",
    "........oBBBBBo.........",
    ".......oBRJJJRBBo.......",
    "......oBBRJJJRBBBo......",
    "......oBBJJjJJBBBo......",
    ".......oBJJJJJBBo.......",
    "........oKKKKKo.........",
    "........oKPPPKo.........",
    ".......oNKPPPKNo........",
    ".......oo....oo.........",
  ],
  wave: [
    "........................",
    "........................",
    ".........oooooo.........",
    ".......ooCCCCCCoo....",
    "......oCCCCCCCCCCo......",
    ".....oCCCccccCCCCo......",
    ".....oCCCo.CC.oCCo......",
    "......oooHHHHHHoo.......",
    "......oHSSSSSSHo........",
    ".....oHSSSESESSHo.......",
    ".....oHSSSSSSSSHo.......",
    "......oSSSMMSSSo........",
    ".......ooSSSSSo.SS......",
    "........oBBBBBo.oo.......",
    ".......oBRJJJRBBoo......",
    "......oBBRJJJRBBB......",
    "......oBBJJjJJBB......",
    ".......oBJJJJJBB.......",
    "........oKKKKKo.........",
    "........oKPPPKo.........",
    ".......oNKPPPKNo........",
    ".......oo....oo.........",
  ],
  point: [
    "........................",
    ".........oooooo.........",
    ".......ooCCCCCCoo.......",
    "......oCCCCCCCCCCo......",
    ".....oCCCccccCCCCo......",
    ".....oCCCo.CC.oCCo......",
    "......oooHHHHHHoo.......",
    "......oHSSSSSSHo........",
    ".....oHSSESSESSHo.......",
    ".....oHSSSSSSSSHo...",
    "......oSSSMMSSSoo..",
    ".......ooSSSSoo.........",
    "........oBBBBBo.........",
    ".......oBRJJJRBBooSo.......",
    "......oBBRJJJRBBooSo...",
    "......oBBJJjJJB.......",
    ".......oBJJJJJB........",
    "........oKKKKKo.........",
    "........oKPPPKo.........",
    ".......oNKPPPKNo........",
    ".......oo....oo.........",
  ],
  cheer: [
    "........................",
    "........................",
    ".........oooooo.........",
    ".......ooCCCCCCoo.......",
    "......oCCCCCCCCCCo......",
    ".....oCCCccccCCCCo......",
    ".....oCCCo.CC.oCCo......",
    "......oooHHHHHHoo.......",
    "......oHSSSSSSHo........",
    ".....oHSSESSESSHo.......",
    ".....oHSSSSSSSSHo.......",
    "......oSSSMMSSSo........",
    ".......ooSSSSoo.........",
    "........oBBBBBo.........",
    ".......oBRJJJRBBo.......",
    "......oBBRJJJRBBo......",
    "......oBBJJjJJBBo......",
    ".......oBJJJJJBBo.......",
    "........oKKKKKo.........",
    "........oKPPPKo.........",
    ".......oNKPPPKNo........",
    ".......oo....oo.........",
  ],
};

const PALETTE: Record<string, string> = {
  o: "#1a1006",
  C: "#ff8b4a",
  c: "#c9582c",
  B: "#4b6f84",
  S: "#f1c79b",
  H: "#3a2a14",
  E: "#1a1006",
  M: "#7a3a2a",
  R: "#b74436",
  J: "#315d87",
  j: "#244765",
  K: "#d8b884",
  P: "#2d2418",
  N: "#1a1006",
};

export function IntroMascot({
  pose = "idle",
  size = 5,
  className,
  style,
}: IntroMascotProps) {
  const rows = POSES[pose];

  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        lineHeight: 0,
        imageRendering: "pixelated",
        ...style,
      }}
      aria-hidden="true"
    >
      <svg
        width={24 * size}
        height={rows.length * size}
        viewBox={`0 0 24 ${rows.length}`}
        shapeRendering="crispEdges"
      >
        {rows.map((row, y) =>
          Array.from(row).map((cell, x) =>
            cell === "." ? null : (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width="1"
                height="1"
                fill={PALETTE[cell] ?? "#000"}
              />
            ),
          ),
        )}
      </svg>
    </span>
  );
}

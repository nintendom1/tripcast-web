import { describe, expect, it } from "vitest";
import { bandFractionOf, isOccluded, solveFocusPadding } from "./focusCoordinate";

// MapLibre centers the coord at the center of the viewport inset by padding.
function paddedCenter(
  padding: { top: number; right: number; bottom: number; left: number },
  size: { width: number; height: number },
) {
  return {
    x: (padding.left + (size.width - padding.right)) / 2,
    y: (padding.top + (size.height - padding.bottom)) / 2,
  };
}

describe("solveFocusPadding", () => {
  it("phone: centers the pin in the band between a top card and a bottom sheet", () => {
    const map = { width: 390, height: 844 };
    // Status card occupies top 170px; sheet occupies bottom 78% (top edge at ~186).
    const geo = solveFocusPadding({
      mapRect: map,
      topOccluderBottom: 170,
      bottomOccluderTop: 520,
      bottomOccluderSource: "[data-role='missions-sheet']",
    });

    // The camera's padded center must equal the computed target screen point.
    const center = paddedCenter(geo.padding, map);
    expect(center.x).toBeCloseTo(geo.target.x, 0);
    expect(center.y).toBeCloseTo(geo.target.y, 0);

    // Target sits horizontally centered and vertically mid-band.
    expect(geo.target.x).toBe(195);
    expect(geo.target.y).toBeGreaterThan(170);
    expect(geo.target.y).toBeLessThan(520);
    expect(geo.bottomOccluder?.source).toBe("[data-role='missions-sheet']");
    expect(geo.band.height).toBeGreaterThanOrEqual(80);
  });

  it("no sheet (replay): band spans below the top card, zoom floored at minZoom", () => {
    const map = { width: 390, height: 844 };
    const geo = solveFocusPadding({
      mapRect: map,
      topOccluderBottom: 170,
      bottomOccluderTop: null,
      currentZoom: 11,
      minZoom: 13,
    });
    expect(geo.bottomOccluder).toBeNull();
    expect(geo.zoom).toBe(13); // zoomed out past floor -> bump up to floor
    // Target is below the card, above the map bottom.
    expect(geo.target.y).toBeGreaterThan(170);
    expect(geo.target.y).toBeLessThan(844);
  });

  it("zoom only goes IN: keeps current zoom when already past the floor", () => {
    const geo = solveFocusPadding({
      mapRect: { width: 390, height: 844 },
      topOccluderBottom: 170,
      bottomOccluderTop: 520,
      currentZoom: 16.5,
    });
    expect(geo.zoom).toBe(16.5); // already closer than the default floor -> unchanged
  });

  it("collapsed band: enforces the minimum band height when overlays nearly meet", () => {
    const map = { width: 390, height: 844 };
    const geo = solveFocusPadding({
      mapRect: map,
      topOccluderBottom: 400,
      bottomOccluderTop: 420, // only 20px gap
    });
    expect(geo.band.height).toBeGreaterThanOrEqual(80);
  });

  it("desktop wide: still centers horizontally (chrome is a centered column)", () => {
    const map = { width: 1440, height: 900 };
    const geo = solveFocusPadding({
      mapRect: map,
      topOccluderBottom: 120,
      bottomOccluderTop: 560,
    });
    expect(geo.target.x).toBe(720);
    expect(geo.padding.left).toBeCloseTo(geo.padding.right, 0);
  });
});

describe("bandFractionOf / isOccluded", () => {
  const geo = solveFocusPadding({
    mapRect: { width: 390, height: 844 },
    topOccluderBottom: 170,
    bottomOccluderTop: 520,
  });

  it("reports a centered landing as ~0.5/0.5", () => {
    const frac = bandFractionOf({ x: geo.target.x, y: geo.target.y }, geo);
    expect(frac.x).toBeCloseTo(0.5, 1);
    expect(frac.y).toBeCloseTo(0.5, 1);
  });

  it("flags points behind the card or the sheet as occluded", () => {
    expect(isOccluded({ x: 195, y: 50 }, geo)).toBe(true); // behind top card
    expect(isOccluded({ x: 195, y: 700 }, geo)).toBe(true); // behind sheet
    expect(isOccluded({ x: 195, y: geo.target.y }, geo)).toBe(false);
  });
});

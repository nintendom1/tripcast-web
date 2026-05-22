import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DesktopMapFrame } from "./DesktopMapFrame";

const baseProps = {
  activeDockTab: null as import("../hud/Dock").DockTab | null,
  onDockSelect: vi.fn(),
  onAdd: vi.fn(),
  fanOpen: false,
  role: "traveler" as const,
  badges: {},
};

describe("DesktopMapFrame", () => {
  it("renders children on mobile (isDesktop=false)", () => {
    render(
      <DesktopMapFrame {...baseProps} isDesktop={false}>
        <div data-testid="map-child" />
      </DesktopMapFrame>,
    );
    expect(screen.getByTestId("map-child")).toBeInTheDocument();
  });

  it("renders children as a transparent passthrough while DESKTOP_LAYOUT_ENABLED=false", () => {
    render(
      <DesktopMapFrame {...baseProps} isDesktop={true}>
        <div data-testid="map-child" />
      </DesktopMapFrame>,
    );
    expect(screen.getByTestId("map-child")).toBeInTheDocument();
  });

  it("does not render the left-rail navigation when isDesktop=true", () => {
    render(
      <DesktopMapFrame {...baseProps} isDesktop={true}>
        <div data-testid="map-child" />
      </DesktopMapFrame>,
    );
    expect(screen.queryByRole("navigation", { name: "Map sections" })).not.toBeInTheDocument();
  });
});

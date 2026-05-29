import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { StoredSession } from "../../lib/auth";
import { ThemeProvider } from "../../providers/ThemeProvider";
import * as mapService from "../map/mapService";
import OptionsSheet from "./OptionsSheet";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

// Captured by the hoisted mock factory — cleared per test in the LiveTrailPreviewMap describe.
let minimapInstances: Array<{
  container: HTMLElement;
  handlers: Record<string, Array<() => void>>;
  addSource: ReturnType<typeof vi.fn>;
  addLayer: ReturnType<typeof vi.fn>;
  getSource: ReturnType<typeof vi.fn>;
  setPaintProperty: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  jumpTo: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
  isStyleLoaded: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  fire(event: string): void;
}> = [];

vi.mock("maplibre-gl", () => {
  class MockMap {
    container: HTMLElement;
    handlers: Record<string, Array<() => void>> = {};
    addSource = vi.fn();
    addLayer = vi.fn();
    getSource = vi.fn(() => null);
    setPaintProperty = vi.fn();
    resize = vi.fn();
    jumpTo = vi.fn();
    fitBounds = vi.fn();
    isStyleLoaded = vi.fn(() => true);
    remove = vi.fn(() => { this.handlers = {}; });

    constructor(options: { container: HTMLElement }) {
      this.container = options.container;
      minimapInstances.push(this as any);
    }

    on(event: string, handler: () => void) {
      if (!this.handlers[event]) this.handlers[event] = [];
      this.handlers[event].push(handler);
      return this;
    }

    once(event: string, handler: () => void) {
      const wrap = () => {
        this.handlers[event] = (this.handlers[event] ?? []).filter((h) => h !== wrap);
        handler();
      };
      return this.on(event, wrap);
    }

    fire(event: string) {
      [...(this.handlers[event] ?? [])].forEach((h) => h());
    }
  }

  class LngLatBounds {
    private pts: [number, number][] = [];
    extend(c: [number, number]) { this.pts.push(c); return this; }
    toArray() { return this.pts; }
  }

  return { default: { Map: MockMap, LngLatBounds } };
});

vi.mock("../../components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => (
    open ? <div data-testid="sheet">{children}</div> : null
  ),
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetBody: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  SheetCloseButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>Close</button>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetBackButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>Back</button>
  ),
}));

vi.mock("../followers/CreateInviteControl", () => ({
  default: () => <div>Create invite control</div>,
}));

vi.mock("../privacy/EmergencyResetSheet", () => ({
  EmergencyResetContent: () => <div>Emergency reset</div>,
}));

vi.mock("../travelfunds/TravelFundsSheet", () => ({
  default: () => <div>Travel funds</div>,
}));

vi.mock("./BulkImportSheet", () => ({
  default: () => null,
}));

vi.mock("../../debug/DebugPanel", () => ({
  default: () => <div>Debug panel</div>,
}));

const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const fallbackDifferentTimeZone = detectedTimeZone === "UTC" ? "America/Los_Angeles" : "UTC";

const travelerSession: StoredSession = {
  token: "test-token",
  role: "traveler",
  sessionType: "legacy",
  displayName: "Traveler",
};

const followerSession: StoredSession = {
  token: "follower-token",
  role: "follower",
  sessionType: "follower",
  username: "f1",
  displayName: "Follower",
};

function setupMocks({
  travelerTimeZone = detectedTimeZone,
  allowFollowersTripPath = false,
  liveTrailStatus = {
    enabled: false,
    visibleToFollowers: false,
    sampleCount: 0,
    samples: [],
  },
  liveTrailPreview = {
    startMs: 0,
    endExclusiveMs: 0,
    timeZone: travelerTimeZone ?? detectedTimeZone,
    count: 0,
    samples: [],
  },
  setTimeZoneFn = vi.fn().mockResolvedValue(null),
  updatePreferencesFn = vi.fn().mockResolvedValue(null),
  setLiveTrailEnabledFn = vi.fn().mockResolvedValue(null),
  setLiveTrailVisibilityFn = vi.fn().mockResolvedValue(null),
  deleteLiveTrailRangeFn = vi.fn().mockResolvedValue({ deleted: 0 }),
}: {
  travelerTimeZone?: string | null;
  allowFollowersTripPath?: boolean;
  liveTrailStatus?: {
    enabled: boolean;
    visibleToFollowers: boolean;
    sampleCount: number;
    samples: Array<{
      _id: string;
      lat: number;
      lon: number;
      sampledAt: number;
      accuracy?: number;
    }>;
  };
  liveTrailPreview?: {
    startMs: number;
    endExclusiveMs: number;
    timeZone: string;
    count: number;
    samples: Array<{
      _id: string;
      lat: number;
      lon: number;
      sampledAt: number;
    }>;
  };
  setTimeZoneFn?: ReturnType<typeof vi.fn>;
  updatePreferencesFn?: ReturnType<typeof vi.fn>;
  setLiveTrailEnabledFn?: ReturnType<typeof vi.fn>;
  setLiveTrailVisibilityFn?: ReturnType<typeof vi.fn>;
  deleteLiveTrailRangeFn?: ReturnType<typeof vi.fn>;
} = {}) {
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelerPreferences.travelerGetPreferences) {
      return { travelerTimeZone, allowFollowersTripPath };
    }
    if (ref === tripcastApi.travelerPreferences.followerGetPreferences) {
      return { visible: true, travelerTimeZone, allowFollowersTripPath };
    }
    if (ref === tripcastApi.missionSettings.travelerGetMissionSettings) {
      return {
        moderationMode: "manual_review",
        rateLimitPreset: "per_second",
      };
    }
    if (ref === tripcastApi.liveTrail.travelerGetLiveTrailStatus) {
      return liveTrailStatus;
    }
    if (ref === tripcastApi.liveTrail.travelerPreviewLiveTrailDeleteRange) {
      return liveTrailPreview;
    }
    return undefined;
  });

  vi.mocked(convexReact.useMutation).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelerPreferences.travelerSetTimeZone) {
      return setTimeZoneFn as any;
    }
    if ((ref as any) === (tripcastApi.travelerPreferences as any).travelerUpdatePreferences) {
      return updatePreferencesFn as any;
    }
    if (ref === tripcastApi.liveTrail.travelerSetLiveTrailEnabled) {
      return setLiveTrailEnabledFn as any;
    }
    if (ref === tripcastApi.liveTrail.travelerSetLiveTrailVisibility) {
      return setLiveTrailVisibilityFn as any;
    }
    if (ref === tripcastApi.liveTrail.travelerDeleteLiveTrailRange) {
      return deleteLiveTrailRangeFn as any;
    }
    return vi.fn().mockResolvedValue(null) as any;
  });

  return {
    setTimeZoneFn,
    updatePreferencesFn,
    setLiveTrailEnabledFn,
    setLiveTrailVisibilityFn,
    deleteLiveTrailRangeFn,
  };
}

function renderOptions(overrides?: Partial<React.ComponentProps<typeof OptionsSheet>>) {
  render(
    <ThemeProvider>
      <OptionsSheet
        open
        onOpenChange={vi.fn()}
        session={travelerSession}
        role="traveler"
        onSignOut={vi.fn()}
        onManageFollowers={vi.fn()}
        onReplayFollowerTour={vi.fn()}
        onLoggedOut={vi.fn()}
        onLocationDataCleared={vi.fn()}
        onTripDataDeleted={vi.fn()}
        onResetStarted={vi.fn()}
        {...overrides}
      />
    </ThemeProvider>,
  );
}

function optionSectionLabels() {
  return screen.getAllByRole("heading", { level: 3 }).map((heading) =>
    heading.textContent?.trim() ?? "",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.classList.remove("dark", "theme-dark");
  document.documentElement.removeAttribute("style");
});

describe("OptionsSheet traveler timezone", () => {
  it("shows the traveler timezone in Options with device timezone explanation", () => {
    setupMocks({ travelerTimeZone: "America/Los_Angeles" });

    renderOptions();

    expect(screen.getByText("Traveler Timezone")).toBeInTheDocument();
    expect(screen.getByText("Traveler timezone")).toBeInTheDocument();
    expect(screen.getByText("Based on this device's timezone settings.")).toBeInTheDocument();
    expect(screen.getByText("Saved: America/Los_Angeles")).toBeInTheDocument();
    expect(screen.getByText(`This device: ${detectedTimeZone}`)).toBeInTheDocument();
  });

  it("shows the update button only on mismatch and names the target timezone", async () => {
    const { setTimeZoneFn } = setupMocks({ travelerTimeZone: fallbackDifferentTimeZone });

    renderOptions();

    const button = screen.getByRole("button", { name: `Set timezone to ${detectedTimeZone}` });
    await userEvent.click(button);

    await waitFor(() => {
      expect(setTimeZoneFn).toHaveBeenCalledWith({
        token: "test-token",
        timeZone: detectedTimeZone,
        source: "device",
      });
    });
  });

  it("does not show the update button when the saved timezone matches this device", () => {
    setupMocks({ travelerTimeZone: detectedTimeZone });

    renderOptions();

    expect(screen.queryByRole("button", { name: /set timezone to/i })).not.toBeInTheDocument();
  });
});

describe("OptionsSheet Map Settings", () => {
  it("shows the 'Show Trip Path' toggle for travelers", () => {
    setupMocks();
    renderOptions();
    expect(screen.getByText("Show Trip Path")).toBeInTheDocument();
  });
  it("shows the 'Show Trip Path' toggle for followers", () => {
    setupMocks();
    renderOptions({ session: followerSession, role: "follower" });
    expect(screen.getByText("Show Trip Path")).toBeInTheDocument();
  });

  it("updates localStorage and dispatches event when 'Show Trip Path' is toggled", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    setupMocks();
    renderOptions();

    const checkbox = screen.getByLabelText(/Show Trip Path/i);
    await userEvent.click(checkbox);

    expect(localStorage.getItem("tripcast.showTripPath")).toBe("false");
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
  });

  it("shows 'Followers can see Trip Path' for Traveler", () => {
    setupMocks();
    renderOptions();
    expect(screen.getByText("Followers can see Trip Path")).toBeInTheDocument();
  });
  it("hides 'Followers can see Trip Path' for Follower", () => {
    setupMocks();
    renderOptions({ session: followerSession, role: "follower" });
    expect(screen.queryByText("Followers can see Trip Path")).not.toBeInTheDocument();
  });

  it("calls travelerUpdatePreferences when 'Followers can see Trip Path' is toggled", async () => {
    const { updatePreferencesFn } = setupMocks({ allowFollowersTripPath: false });
    renderOptions();

    const checkbox = screen.getByLabelText(/Followers can see Trip Path/i);
    await userEvent.click(checkbox);

    expect(updatePreferencesFn).toHaveBeenCalledWith({
      token: "test-token",
      allowFollowersTripPath: true,
    });
  });
});

describe("OptionsSheet Live Trail settings", () => {
  it("opens Traveler Live Trail settings and updates recording visibility toggles", async () => {
    const {
      setLiveTrailEnabledFn,
      setLiveTrailVisibilityFn,
    } = setupMocks({
      liveTrailStatus: {
        enabled: false,
        visibleToFollowers: false,
        sampleCount: 0,
        samples: [],
      },
    });
    renderOptions();

    await userEvent.click(screen.getByRole("button", { name: /Live Trail/i }));
    expect(screen.getByRole("heading", { name: "Live Trail" })).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(setLiveTrailEnabledFn).toHaveBeenCalledWith({
      token: "test-token",
      enabled: true,
    });

    await userEvent.click(screen.getByLabelText(/Show to Followers/i));
    expect(setLiveTrailVisibilityFn).toHaveBeenCalledWith({
      token: "test-token",
      visibleToFollowers: true,
    });
  });

  it("previews a deletion range with time precision and quick-fill buttons", async () => {
    const { deleteLiveTrailRangeFn } = setupMocks({
      travelerTimeZone: "America/Los_Angeles",
      liveTrailPreview: {
        startMs: Date.UTC(2026, 4, 1, 7),
        endExclusiveMs: Date.UTC(2026, 4, 1, 8),
        timeZone: "America/Los_Angeles",
        count: 5,
        samples: [],
      },
    });
    renderOptions({ defaultView: "live-trail" });

    expect(screen.getByText("30 min")).toBeInTheDocument();
    expect(screen.getByText("1 hour")).toBeInTheDocument();

    await userEvent.click(screen.getByText("1 hour"));

    expect(screen.getByText(/5 breadcrumbs selected/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Delete selected breadcrumbs/i }));

    expect(deleteLiveTrailRangeFn).toHaveBeenCalledWith({
      token: "test-token",
      startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
      endDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
      timeZone: "America/Los_Angeles",
    });
  });

  it("previews a deletion range and confirms only when breadcrumbs are selected", async () => {
    const { deleteLiveTrailRangeFn } = setupMocks({
      travelerTimeZone: "America/Los_Angeles",
      liveTrailPreview: {
        startMs: Date.UTC(2026, 4, 1, 7),
        endExclusiveMs: Date.UTC(2026, 4, 2, 7),
        timeZone: "America/Los_Angeles",
        count: 2,
        samples: [
          { _id: "sample-1", lat: 47.61, lon: -122.33, sampledAt: Date.UTC(2026, 4, 1, 16) },
          { _id: "sample-2", lat: 47.62, lon: -122.34, sampledAt: Date.UTC(2026, 4, 1, 17) },
        ],
      },
    });
    renderOptions({ defaultView: "live-trail" });

    expect(screen.getByRole("img", { name: "Live Trail deletion preview map" })).toBeInTheDocument();
    expect(screen.getByText(/2 breadcrumbs selected/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Delete selected breadcrumbs/i }));

    expect(deleteLiveTrailRangeFn).toHaveBeenCalledWith({
      token: "test-token",
      startDate: expect.stringContaining("T"),
      endDate: expect.stringContaining("T"),
      timeZone: "America/Los_Angeles",
    });
  });

  it("does not show Live Trail settings to Followers", () => {
    setupMocks();
    renderOptions({ session: followerSession, role: "follower" });

    expect(screen.queryByRole("button", { name: /Live Trail/i })).not.toBeInTheDocument();
  });
});

describe("OptionsSheet developer scoring toggle", () => {

  it("shows the Traveler-only 'Earn Follower points as Traveler' toggle for the Traveler", () => {
    setupMocks();
    renderOptions();
    expect(screen.getByText("Earn Follower points as Traveler")).toBeInTheDocument();
  });

  it("does not show the developer scoring toggle for a Follower", () => {
    setupMocks();
    renderOptions({ session: followerSession, role: "follower" });
    expect(
      screen.queryByText("Earn Follower points as Traveler"),
    ).not.toBeInTheDocument();
  });

  it("manually triggers map cooldown from Developer options", async () => {
    localStorage.setItem("tripcast.debug.enabled", "true");
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    setupMocks();
    renderOptions();

    await userEvent.click(screen.getByRole("button", { name: /trigger map cooldown/i }));

    expect(sessionStorage.getItem("tripcast.map_cooldown")).not.toBeNull();
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: "tripcast.mapCooldownChanged",
    }));
    expect(localStorage.getItem("tripcast.debug.logs")).toContain("map:cooldown:manual-trigger");
  });

  it("keeps Developer options at the top for a Traveler", () => {
    setupMocks();
    renderOptions();

    const labels = optionSectionLabels();

    expect(labels.indexOf("Developer")).toBeLessThan(labels.indexOf("Appearance"));
  });

  it("moves Developer options to the bottom for a Follower", () => {
    setupMocks();
    renderOptions({ session: followerSession, role: "follower" });

    const labels = optionSectionLabels();

    expect(labels.at(-1)).toBe("Developer");
    expect(labels.indexOf("Developer")).toBeGreaterThan(labels.indexOf("Trip"));
  });
});

describe("OptionsSheet appearance", () => {
  it("shows light/dark choices and automatic theme as a toggle", () => {
    setupMocks();
    renderOptions();

    const appearanceSection = screen.getByText("Appearance").closest("section");
    expect(appearanceSection).not.toBeNull();
    const labels = within(appearanceSection!).getAllByRole("button").map((button) =>
      button.textContent?.trim(),
    );

    expect(labels).toEqual(["Light", "Dark"]);
    expect(within(appearanceSection!).getByRole("checkbox", { name: /automatic theme/i })).toBeChecked();
  });
});

describe("LiveTrailPreviewMap", () => {
  beforeEach(() => {
    minimapInstances = [];
    // Make container report a real height so sync fires immediately in most tests.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 320, height: 160, top: 100, bottom: 260, left: 0, right: 320, x: 0, y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    // Provide a valid style URL so the map init effect doesn't return early.
    vi.spyOn(mapService, "getMapStyleResolution").mockReturnValue({
      styleUrl: "http://mock-tiles/style.json",
      baseUrl: "http://mock-tiles",
      source: "local-dev" as const,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wraps the MapLibre container in an absolute-inset-0 div so MapLibre CSS (position:relative) cannot collapse it", () => {
    setupMocks();
    renderOptions({ defaultView: "live-trail" });

    const mapImg = screen.getByRole("img", { name: "Live Trail deletion preview map" });
    const wrapper = mapImg.firstElementChild as HTMLElement;

    // Outer div → wrapper with absolute inset-0 (owns the positioning)
    expect(wrapper.className).toContain("absolute");
    expect(wrapper.className).toContain("inset-0");

    // MapLibre container is INSIDE the wrapper, not directly on the outer div
    const inner = wrapper.firstElementChild as HTMLElement;
    expect(inner).not.toBeNull();
    expect(inner.className).toContain("h-full");
    expect(inner.className).toContain("w-full");
    expect(inner.className).not.toContain("absolute");
  });

  it("initializes MapLibre on the inner h-full div, not the absolute wrapper", async () => {
    setupMocks();
    renderOptions({ defaultView: "live-trail" });

    await waitFor(() => expect(minimapInstances.length).toBeGreaterThan(0));

    const { container } = minimapInstances.at(-1)!;
    expect(container.className).toContain("h-full");
    expect(container.className).not.toContain("absolute");
    // Its direct parent is the absolute-inset-0 wrapper
    expect(container.parentElement?.className).toContain("absolute");
    expect(container.parentElement?.className).toContain("inset-0");
  });

  it("calls resize, addSource, addLayer, and jumpTo after load with a single breadcrumb", async () => {
    setupMocks({
      liveTrailPreview: {
        startMs: 0,
        endExclusiveMs: 1000,
        timeZone: detectedTimeZone,
        count: 1,
        samples: [{ _id: "s1", lat: 47.4023, lon: -122.2015, sampledAt: 1000 }],
      },
    });
    renderOptions({ defaultView: "live-trail" });

    await waitFor(() => expect(minimapInstances.length).toBeGreaterThan(0));
    const map = minimapInstances.at(-1)!;

    await act(async () => { map.fire("load"); });

    await waitFor(() => {
      expect(map.resize).toHaveBeenCalled();
      expect(map.addSource).toHaveBeenCalledWith(
        "trail-preview",
        expect.objectContaining({ type: "geojson" }),
      );
      expect(map.addLayer).toHaveBeenCalledTimes(2);
      expect(map.jumpTo).toHaveBeenCalledWith({ center: [-122.2015, 47.4023], zoom: 14 });
    });
  });

  it("calls fitBounds instead of jumpTo when there are multiple breadcrumbs", async () => {
    setupMocks({
      liveTrailPreview: {
        startMs: 0,
        endExclusiveMs: 2000,
        timeZone: detectedTimeZone,
        count: 2,
        samples: [
          { _id: "s1", lat: 47.40, lon: -122.20, sampledAt: 1000 },
          { _id: "s2", lat: 47.41, lon: -122.21, sampledAt: 2000 },
        ],
      },
    });
    renderOptions({ defaultView: "live-trail" });

    await waitFor(() => expect(minimapInstances.length).toBeGreaterThan(0));
    const map = minimapInstances.at(-1)!;

    await act(async () => { map.fire("load"); });

    await waitFor(() => {
      expect(map.fitBounds).toHaveBeenCalledWith(
        expect.anything(),
        { padding: 40, animate: false, maxZoom: 15 },
      );
      expect(map.jumpTo).not.toHaveBeenCalled();
    });
  });

  it("shows the empty-state overlay when there are no breadcrumbs in the selected range", () => {
    setupMocks({
      liveTrailPreview: {
        startMs: 0,
        endExclusiveMs: 0,
        timeZone: detectedTimeZone,
        count: 0,
        samples: [],
      },
    });
    renderOptions({ defaultView: "live-trail" });

    expect(screen.getByText("No breadcrumbs in range")).toBeInTheDocument();
  });
});

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
  deleteLiveTrailSamplesFn = vi.fn().mockResolvedValue({ deleted: 0 }),
  setMysterySettingsFn = vi.fn().mockResolvedValue(null),
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
  deleteLiveTrailSamplesFn?: ReturnType<typeof vi.fn>;
  setMysterySettingsFn?: ReturnType<typeof vi.fn>;
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
    if (ref === tripcastApi.mysteryMissions.travelerGetMysteryMissionSettings) {
      return { enabled: true, revealIntervalHours: 4, updatedAt: null };
    }
    if (ref === tripcastApi.mysteryMissions.travelerListMysteryMissions) {
      return {
        settings: { enabled: true, revealIntervalHours: 4 },
        counts: { total: 0, signal: 0, dormant: 0, completed: 0, dismissed: 0 },
        rows: [],
      };
    }
    if (ref === tripcastApi.mysteryMissions.travelerExportMysteryMissions) {
      return { version: 1, exportedAt: 0, missions: [] };
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
    if (ref === tripcastApi.liveTrail.travelerDeleteLiveTrailSamples) {
      return deleteLiveTrailSamplesFn as any;
    }
    if (ref === tripcastApi.mysteryMissions.travelerSetMysteryMissionsEnabled) {
      return setMysterySettingsFn as any;
    }
    return vi.fn().mockResolvedValue(null) as any;
  });

  return {
    setTimeZoneFn,
    updatePreferencesFn,
    setLiveTrailEnabledFn,
    setLiveTrailVisibilityFn,
    deleteLiveTrailRangeFn,
    deleteLiveTrailSamplesFn,
    setMysterySettingsFn,
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
  it("shows the traveler timezone in Options with the saved value and detected device", () => {
    setupMocks({ travelerTimeZone: "America/Los_Angeles" });

    renderOptions();

    expect(screen.getByText("Traveler Timezone")).toBeInTheDocument();
    expect(screen.getByText("Traveler timezone")).toBeInTheDocument();
    expect(screen.getByText(/Drives bedtime\/wake estimates/i)).toBeInTheDocument();
    expect(screen.getByText(/^Saved: America\/Los_Angeles/)).toBeInTheDocument();
    expect(screen.getByText(`This device: ${detectedTimeZone}`)).toBeInTheDocument();
    // Picker is always visible (manual override + debugging band-aid).
    expect(screen.getByLabelText("Change timezone")).toBeInTheDocument();
  });

  it("applies the device timezone with source=device when chosen", async () => {
    const { setTimeZoneFn } = setupMocks({ travelerTimeZone: fallbackDifferentTimeZone });

    renderOptions();

    const select = screen.getByLabelText("Change timezone") as HTMLSelectElement;
    await userEvent.selectOptions(select, "__device__");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(setTimeZoneFn).toHaveBeenCalledWith({
        token: "test-token",
        timeZone: detectedTimeZone,
        source: "device",
      });
    });
  });

  it("applies a curated IANA timezone with source=manual", async () => {
    const { setTimeZoneFn } = setupMocks({ travelerTimeZone: detectedTimeZone });

    renderOptions();

    const select = screen.getByLabelText("Change timezone") as HTMLSelectElement;
    await userEvent.selectOptions(select, "Asia/Tokyo");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(setTimeZoneFn).toHaveBeenCalledWith({
        token: "test-token",
        timeZone: "Asia/Tokyo",
        source: "manual",
      });
    });
  });

  it("applies a custom IANA timezone via the Other option with source=manual", async () => {
    const { setTimeZoneFn } = setupMocks({ travelerTimeZone: detectedTimeZone });

    renderOptions();

    const select = screen.getByLabelText("Change timezone") as HTMLSelectElement;
    await userEvent.selectOptions(select, "__other__");
    const input = screen.getByPlaceholderText(/e\.g\. America\/Argentina\/Buenos_Aires/i);
    await userEvent.type(input, "America/Argentina/Buenos_Aires");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(setTimeZoneFn).toHaveBeenCalledWith({
        token: "test-token",
        timeZone: "America/Argentina/Buenos_Aires",
        source: "manual",
      });
    });
  });

  it("rejects an invalid IANA string from the Other input", async () => {
    const { setTimeZoneFn } = setupMocks({ travelerTimeZone: detectedTimeZone });

    renderOptions();

    const select = screen.getByLabelText("Change timezone") as HTMLSelectElement;
    await userEvent.selectOptions(select, "__other__");
    const input = screen.getByPlaceholderText(/e\.g\. America\/Argentina\/Buenos_Aires/i);
    await userEvent.type(input, "Not/A_Real_Zone");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't a recognized IANA timezone/i);
    expect(setTimeZoneFn).not.toHaveBeenCalled();
  });

  it("saves the theme day/night window via travelerUpdatePreferences", async () => {
    const { updatePreferencesFn } = setupMocks({ travelerTimeZone: detectedTimeZone });

    renderOptions();

    const dayInput = screen.getByLabelText("Day starts at") as HTMLInputElement;
    const nightInput = screen.getByLabelText("Night starts at") as HTMLInputElement;
    await userEvent.clear(dayInput);
    await userEvent.type(dayInput, "08:30");
    await userEvent.clear(nightInput);
    await userEvent.type(nightInput, "19:45");
    await userEvent.click(screen.getByRole("button", { name: "Save day/night times" }));

    await waitFor(() => {
      expect(updatePreferencesFn).toHaveBeenCalledWith({
        token: "test-token",
        themeDayStartMinutes: 8 * 60 + 30,
        themeNightStartMinutes: 19 * 60 + 45,
      });
    });
  });

  it("rejects a zero-length theme window before calling the mutation", async () => {
    const { updatePreferencesFn } = setupMocks({ travelerTimeZone: detectedTimeZone });

    renderOptions();

    const dayInput = screen.getByLabelText("Day starts at") as HTMLInputElement;
    const nightInput = screen.getByLabelText("Night starts at") as HTMLInputElement;
    await userEvent.clear(dayInput);
    await userEvent.type(dayInput, "10:00");
    await userEvent.clear(nightInput);
    await userEvent.type(nightInput, "10:00");
    await userEvent.click(screen.getByRole("button", { name: "Save day/night times" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/must be different/i);
    expect(updatePreferencesFn).not.toHaveBeenCalled();
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

    expect(screen.getByText(/5 of 5 breadcrumbs selected/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Delete 5 breadcrumbs/i }));

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
    expect(screen.getByText(/2 of 2 breadcrumbs selected/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Delete 2 breadcrumbs/i }));

    expect(deleteLiveTrailRangeFn).toHaveBeenCalledWith({
      token: "test-token",
      startDate: expect.stringContaining("T"),
      endDate: expect.stringContaining("T"),
      timeZone: "America/Los_Angeles",
    });
  });

  it("deletes every other breadcrumb by explicit sample id", async () => {
    const { deleteLiveTrailSamplesFn } = setupMocks({
      travelerTimeZone: "America/Los_Angeles",
      liveTrailPreview: {
        startMs: Date.UTC(2026, 4, 1, 7),
        endExclusiveMs: Date.UTC(2026, 4, 2, 7),
        timeZone: "America/Los_Angeles",
        count: 5,
        samples: [
          { _id: "sample-1", lat: 47.61, lon: -122.31, sampledAt: Date.UTC(2026, 4, 1, 16) },
          { _id: "sample-2", lat: 47.62, lon: -122.32, sampledAt: Date.UTC(2026, 4, 1, 17) },
          { _id: "sample-3", lat: 47.63, lon: -122.33, sampledAt: Date.UTC(2026, 4, 1, 18) },
          { _id: "sample-4", lat: 47.64, lon: -122.34, sampledAt: Date.UTC(2026, 4, 1, 19) },
          { _id: "sample-5", lat: 47.65, lon: -122.35, sampledAt: Date.UTC(2026, 4, 1, 20) },
        ],
      },
    });
    renderOptions({ defaultView: "live-trail" });

    await userEvent.selectOptions(screen.getByLabelText(/Delete mode/i), "every_other");

    expect(screen.getByText(/2 of 5 breadcrumbs selected/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Delete 2 breadcrumbs/i }));

    expect(deleteLiveTrailSamplesFn).toHaveBeenCalledWith({
      token: "test-token",
      sampleIds: ["sample-2", "sample-4"],
    });
  });

  it("lets the traveler select individual breadcrumbs before deleting", async () => {
    const { deleteLiveTrailSamplesFn } = setupMocks({
      travelerTimeZone: "America/Los_Angeles",
      liveTrailPreview: {
        startMs: Date.UTC(2026, 4, 1, 7),
        endExclusiveMs: Date.UTC(2026, 4, 2, 7),
        timeZone: "America/Los_Angeles",
        count: 3,
        samples: [
          { _id: "sample-1", lat: 47.61, lon: -122.31, sampledAt: Date.UTC(2026, 4, 1, 16) },
          { _id: "sample-2", lat: 47.62, lon: -122.32, sampledAt: Date.UTC(2026, 4, 1, 17) },
          { _id: "sample-3", lat: 47.63, lon: -122.33, sampledAt: Date.UTC(2026, 4, 1, 18) },
        ],
      },
    });
    renderOptions({ defaultView: "live-trail" });

    await userEvent.selectOptions(screen.getByLabelText(/Delete mode/i), "individual");
    expect(screen.getByText(/0 of 3 breadcrumbs selected/i)).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText(/#2/i));
    await userEvent.click(screen.getByLabelText(/#3/i));

    expect(screen.getByText(/2 of 3 breadcrumbs selected/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Delete 2 breadcrumbs/i }));

    expect(deleteLiveTrailSamplesFn).toHaveBeenCalledWith({
      token: "test-token",
      sampleIds: ["sample-2", "sample-3"],
    });
  });

  it("does not show Live Trail settings to Followers", () => {
    setupMocks();
    renderOptions({ session: followerSession, role: "follower" });

    expect(screen.queryByRole("button", { name: /Live Trail/i })).not.toBeInTheDocument();
  });
});

describe("OptionsSheet Mystery Mission settings", () => {
  it("saves the Traveler reveal interval hours", async () => {
    const { setMysterySettingsFn } = setupMocks();
    renderOptions();

    await userEvent.click(screen.getByRole("button", { name: /Mystery Missions/i }));
    const input = await screen.findByLabelText(/Reveal interval hours/i);
    await userEvent.clear(input);
    await userEvent.type(input, "6");
    await userEvent.click(screen.getByRole("button", { name: /Save interval/i }));

    await waitFor(() => {
      expect(setMysterySettingsFn).toHaveBeenCalledWith({
        token: "test-token",
        enabled: true,
        revealIntervalHours: 6,
      });
    });
  });

  it("rejects reveal intervals outside the allowed range before saving", async () => {
    const { setMysterySettingsFn } = setupMocks();
    renderOptions();

    await userEvent.click(screen.getByRole("button", { name: /Mystery Missions/i }));
    const input = await screen.findByLabelText(/Reveal interval hours/i);
    await userEvent.clear(input);
    await userEvent.type(input, "169");
    await userEvent.click(screen.getByRole("button", { name: /Save interval/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/0 to 168 hours/i);
    expect(setMysterySettingsFn).not.toHaveBeenCalled();
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

  it("shows 'Trigger Test Toast' in Developer options for Traveler", async () => {
    setupMocks();
    const onTriggerTestToast = vi.fn();
    renderOptions({ onTriggerTestToast });

    expect(screen.getByText("Trigger Test Toast")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /trigger test toast/i }));
    expect(onTriggerTestToast).toHaveBeenCalled();
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
  it("shows light, dark, and auto choices with accessible selection state", async () => {
    setupMocks();
    renderOptions();

    const appearanceSection = screen.getByText("Appearance").closest("section");
    expect(appearanceSection).not.toBeNull();
    const appearance = within(appearanceSection!);
    const buttons = appearance.getAllByRole("button");
    const labels = buttons.map((button) => button.textContent?.trim());

    expect(labels).toEqual(["Light", "Dark", "Auto"]);
    expect(appearance.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(appearance.getByRole("button", { name: "Dark" }));

    expect(appearance.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(appearance.queryByText(/traveler's local day\/night time/i)).not.toBeInTheDocument();

    await userEvent.click(appearance.getByRole("button", { name: "Auto" }));

    expect(appearance.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");
    expect(appearance.getByText(/traveler's local day\/night time/i)).toBeInTheDocument();
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

describe("OptionsSheet Follower content cutoff", () => {
  it("places the cutoff row directly above the Danger Zone for Travelers", () => {
    setupMocks();
    renderOptions();

    expect(screen.getByRole("heading", { name: /privacy/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /follower content cutoff/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /danger zone/i })).toBeInTheDocument();
  });

  it("toggling the enable switch persists followerContentCutoffEnabled", async () => {
    const { updatePreferencesFn } = setupMocks();
    renderOptions({ defaultView: "follower-cutoff" });

    // The first switch row in the sub-view is the enable toggle.
    const toggle = await screen.findByRole("checkbox", { name: /cutoff disabled/i });
    await userEvent.click(toggle);

    expect(updatePreferencesFn).toHaveBeenCalledWith(
      expect.objectContaining({ followerContentCutoffEnabled: true }),
    );
  });

  it("saves a chosen cutoff date+time via Save cutoff", async () => {
    const { updatePreferencesFn } = setupMocks({ travelerTimeZone: "UTC" });
    // Seed: cutoff toggle is already enabled so the pickers are interactive.
    vi.mocked(convexReact.useQuery).mockImplementation((...args: any[]) => {
      const [ref] = args;
      if (ref === tripcastApi.travelerPreferences.travelerGetPreferences) {
        return {
          travelerTimeZone: "UTC",
          allowFollowersTripPath: false,
          followerContentCutoffEnabled: true,
        };
      }
      if (ref === tripcastApi.travelerPreferences.travelerGetOldestContent) return null;
      return undefined;
    });
    renderOptions({ defaultView: "follower-cutoff" });

    await userEvent.type(await screen.findByLabelText(/^Date$/i), "2026-06-09");
    await userEvent.type(screen.getByLabelText(/^Time$/i), "09:00");
    await userEvent.click(screen.getByRole("button", { name: /save cutoff/i }));

    expect(updatePreferencesFn).toHaveBeenCalledWith(
      expect.objectContaining({ followerContentCutoffAt: expect.any(Number) }),
    );
  });

  it("'Use now as cutoff' populates the pickers", async () => {
    setupMocks({ travelerTimeZone: "UTC" });
    vi.mocked(convexReact.useQuery).mockImplementation((...args: any[]) => {
      const [ref] = args;
      if (ref === tripcastApi.travelerPreferences.travelerGetPreferences) {
        return {
          travelerTimeZone: "UTC",
          allowFollowersTripPath: false,
          followerContentCutoffEnabled: true,
        };
      }
      if (ref === tripcastApi.travelerPreferences.travelerGetOldestContent) return null;
      return undefined;
    });
    renderOptions({ defaultView: "follower-cutoff" });

    const dateInput = (await screen.findByLabelText(/^Date$/i)) as HTMLInputElement;
    const timeInput = screen.getByLabelText(/^Time$/i) as HTMLInputElement;
    expect(dateInput.value).toBe("");
    expect(timeInput.value).toBe("");

    await userEvent.click(screen.getByRole("button", { name: /use now as cutoff/i }));

    expect(dateInput.value).not.toBe("");
    expect(timeInput.value).not.toBe("");
  });
});

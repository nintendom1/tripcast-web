import { act, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "react-error-boundary";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tripcastApi, type CurrentTrip } from "../convex/tripcastApi";
import type { TripContextValue } from "../features/trips/tripTypes";
import { getLiveSharingEnabled, setLiveSharingEnabled } from "../lib/liveSharingPreference";
import { readLiveSnooze, writeLiveSnooze } from "../lib/liveSnooze";
import { TripContextTestProvider, useTripContext } from "../providers/TripContextProvider";
import { LivePublishingBridge } from "./LivePublishingBridge";
import {
  FIRST_LAUNCH_WAIT_MS,
  clearPublishingIdentity,
  tokenScope,
  writePublishingIdentity,
} from "./useNativePublishingConfig";
import { nativeLocationManager } from "./nativeLocationManager";
import {
  clearLiveSharingStopNotice,
  getLiveSharingStopNotice,
  getNativePublishingTags,
  isNativePublishingTagsSent,
  reportNativePublishingRevoked,
  requestNativePublishingRetry,
  subscribeLiveSharingStopped,
} from "./nativePublishingSignal";

const native = vi.hoisted(() => ({
  configure: vi.fn(),
  retry: vi.fn(),
  liveAtConfigure: [] as boolean[],
}));

const plugin = vi.hoisted(() => ({ configurePublishing: vi.fn() }));

// The real native manager (imported below for the revoke routing test) talks to this fake AdaptiveLocation plugin.
vi.mock("@capacitor/core", () => ({
  registerPlugin: () => ({ configurePublishing: plugin.configurePublishing }),
}));

const server = vi.hoisted(() => ({
  calls: [] as Array<{ ref: unknown; args: unknown }>,
  throwCloakingPins: false,
  /** Live-trail setting per trip id (absent: enabled). */
  liveTrailByTrip: {} as Record<string, boolean>,
  /** Trip ids whose settings are still loading (queries return undefined). */
  loadingTrips: new Set<string>(),
}));

vi.mock("./locationWatcher", () => ({
  configureNativeLocationPublishing: native.configure,
  isAdaptiveLocationAvailable: () => true,
  retryNativeLocationTracking: native.retry,
}));

// Fresh objects on every call, as real subscriptions may return: the bridge must compare settings by value.
vi.mock("convex/react", () => ({
  useQuery: (ref: unknown, args: unknown) => {
    server.calls.push({ ref, args });
    if (args === "skip") return undefined;
    const tripId = (args as { tripId?: string }).tripId;
    if (tripId && server.loadingTrips.has(tripId)) return undefined;
    if (ref === tripcastApi.travelerPreferences.travelerGetPreferences) return { movementDetectionEnabled: true };
    if (ref === tripcastApi.liveTrail.travelerGetLiveTrailStatus) {
      return { enabled: tripId ? (server.liveTrailByTrip[tripId] ?? true) : true, visibleToFollowers: false };
    }
    if (ref === tripcastApi.cloakingPins.travelerListCloakingPins) {
      if (server.throwCloakingPins) throw new Error("query failed");
      return [{ _id: "pin-1", lat: 1, lon: 2, radiusMeters: 300 }];
    }
    return undefined;
  },
  useMutation: () => vi.fn(),
  useConvex: () => ({}),
}));

const AUTUMN: CurrentTrip = {
  tripId: "trip-autumn",
  title: "Autumn 2026",
  lifecycle: "in_progress",
  isLegacy: false,
  revision: 4,
  publishingEpoch: 3,
  epochStartedAt: 1,
  multiTripEnabled: true,
};
const SUMMER: CurrentTrip = { ...AUTUMN, tripId: "trip-summer", title: "Summer 2026", revision: 5, publishingEpoch: 4 };

const TRIP_TAG_KEYS = ["captureTripId", "publishingEpoch", "tripTitle"];

/** Context with multi-trip enabled and `current` as the shared current trip, following it unless overridden. */
function enabled(current: CurrentTrip, overrides: Partial<TripContextValue> = {}): Partial<TripContextValue> {
  return {
    token: "token-1",
    currentTrip: current,
    followerTrip: current,
    multiTripEnabled: true,
    viewingMode: "follow_current",
    viewingTripId: current.tripId,
    viewingTrip: { tripId: current.tripId, title: current.title },
    ...overrides,
  };
}

const viewingSummerPrivately: Partial<TripContextValue> = {
  viewingMode: "private",
  viewingTripId: SUMMER.tripId,
  viewingTrip: { tripId: SUMMER.tripId, title: SUMMER.title },
};

function FakeMap({ crash = false }: { crash?: boolean }) {
  const { viewingTripId } = useTripContext();
  if (crash) throw new Error("map crashed");
  return <div data-testid="map">{viewingTripId ?? "none"}</div>;
}

function Harness({
  value,
  mapKey = 0,
  crash = false,
}: {
  value: Partial<TripContextValue>;
  mapKey?: number;
  crash?: boolean;
}) {
  return (
    <TripContextTestProvider value={value}>
      <LivePublishingBridge token="token-1" role="traveler" gpsSuppressedUntil={null} />
      <ErrorBoundary fallbackRender={() => <div data-testid="map-error" />} resetKeys={[mapKey]}>
        <FakeMap key={mapKey} crash={crash} />
      </ErrorBoundary>
    </TripContextTestProvider>
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function lastConfig(): Record<string, unknown> {
  const call = native.configure.mock.calls.at(-1);
  if (!call) throw new Error("configure was not called");
  return call[0] as Record<string, unknown>;
}

function argsOf(ref: unknown) {
  return server.calls.filter((call) => call.ref === ref).map((call) => call.args);
}

let notices: string[] = [];
let unsubscribeNotices: () => void = () => {};

beforeEach(() => {
  vi.stubEnv("VITE_CONVEX_URL", "https://example.invalid");
  localStorage.clear();
  setLiveSharingEnabled(false);
  native.liveAtConfigure.length = 0;
  native.configure.mockReset();
  native.configure.mockImplementation(() => {
    native.liveAtConfigure.push(getLiveSharingEnabled());
    return Promise.resolve();
  });
  native.retry.mockReset();
  native.retry.mockResolvedValue(undefined);
  server.calls.length = 0;
  server.throwCloakingPins = false;
  server.liveTrailByTrip = {};
  server.loadingTrips.clear();
  const stale = getLiveSharingStopNotice();
  if (stale) clearLiveSharingStopNotice(stale.id);
  notices = [];
  unsubscribeNotices = subscribeLiveSharingStopped(() => {
    const notice = getLiveSharingStopNotice();
    if (notice) notices.push(notice.message);
  });
});

afterEach(() => {
  unsubscribeNotices();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("LivePublishingBridge configuration", () => {
  it("configures once and does not re-run for the viewed trip, a map remount or crash, or unrelated context fields", async () => {
    const { rerender } = render(<Harness value={enabled(AUTUMN)} />);
    await flush();
    expect(native.configure).toHaveBeenCalledTimes(1);

    rerender(<Harness value={enabled(AUTUMN, viewingSummerPrivately)} />);
    expect(screen.getByTestId("map")).toHaveTextContent(SUMMER.tripId);
    rerender(<Harness value={enabled(AUTUMN, viewingSummerPrivately)} mapKey={1} />);
    rerender(<Harness value={enabled(AUTUMN, viewingSummerPrivately)} mapKey={1} crash />);
    expect(screen.getByTestId("map-error")).toBeInTheDocument();
    rerender(<Harness value={enabled(AUTUMN)} mapKey={2} />);
    rerender(
      <Harness
        value={{ ...enabled(AUTUMN), followerTrip: null, openPrivately: () => {}, reportTripUnavailable: () => {} }}
        mapKey={2}
      />,
    );
    await flush();

    expect(native.configure).toHaveBeenCalledTimes(1);
  });

  it("sends no trip tags and untagged settings queries while multi-trip is disabled (today's configuration)", async () => {
    render(<Harness value={{}} />);
    await flush();

    expect(native.configure).toHaveBeenCalledTimes(1);
    expect(Object.keys(lastConfig()).sort()).toEqual([
      "alertThresholdSeconds",
      "cloakTimeoutSeconds",
      "cloakZones",
      "emissionIntervalSeconds",
      "endpoint",
      "includeDebugMysteryMissions",
      "liveTrailEnabled",
      "movementDetectionEnabled",
      "token",
      "usageGuard",
    ]);
    expect(lastConfig()).toMatchObject({
      token: "token-1",
      liveTrailEnabled: true,
      movementDetectionEnabled: true,
      cloakZones: [{ lat: 1, lon: 2, radiusMeters: 300 }],
    });
    expect(lastConfig().usageGuard).toEqual({ bytesPerUpload: 4500, monthlyLimitBytes: 1_000_000_000, pausePercent: 99 });
    expect(isNativePublishingTagsSent()).toBe(false);
    expect(argsOf(tripcastApi.liveTrail.travelerGetLiveTrailStatus)).toContainEqual({ token: "token-1" });
    for (const args of argsOf(tripcastApi.travelerPreferences.travelerGetPreferences)) {
      expect(args).toEqual({ token: "token-1" });
    }
  });

  it("tags with the shared current trip, never the trip viewed privately", async () => {
    const { rerender } = render(<Harness value={{}} />);
    await flush();
    for (const key of TRIP_TAG_KEYS) expect(lastConfig()).not.toHaveProperty(key);

    server.calls.length = 0;
    rerender(<Harness value={enabled(AUTUMN, viewingSummerPrivately)} />);
    await flush();

    expect(native.configure).toHaveBeenCalledTimes(2);
    expect(lastConfig()).toMatchObject({
      captureTripId: AUTUMN.tripId,
      publishingEpoch: AUTUMN.publishingEpoch,
      tripTitle: AUTUMN.title,
      usageGuard: { bytesPerUpload: 5100, monthlyLimitBytes: 1_000_000_000, pausePercent: 99 },
    });
    expect(isNativePublishingTagsSent()).toBe(true);
    for (const args of argsOf(tripcastApi.liveTrail.travelerGetLiveTrailStatus)) {
      expect(args).toEqual({ token: "token-1", tripId: AUTUMN.tripId });
    }
  });

  it("changes only the trip tags at a switch, so the phone keeps it a tags-only reconfigure", async () => {
    const { rerender, unmount } = render(<Harness value={enabled(AUTUMN)} />);
    await flush();
    const before = lastConfig();

    rerender(<Harness value={enabled(SUMMER)} />);
    await flush();
    const after = lastConfig();

    const withoutTags = (config: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(config).filter(([key]) => !TRIP_TAG_KEYS.includes(key)));
    expect(native.configure).toHaveBeenCalledTimes(2);
    expect(withoutTags(after)).toEqual(withoutTags(before));
    expect(after).toMatchObject({ captureTripId: SUMMER.tripId, publishingEpoch: 4, tripTitle: SUMMER.title });

    unmount();
    expect(isNativePublishingTagsSent()).toBe(false);
  });

  it("re-runs on the retry nonce and does not configure for a Follower", async () => {
    const { unmount } = render(<Harness value={enabled(AUTUMN)} />);
    await flush();
    act(() => requestNativePublishingRetry());
    await flush();
    expect(native.configure).toHaveBeenCalledTimes(2);
    unmount();

    native.configure.mockClear();
    render(
      <TripContextTestProvider value={{ role: "follower" }}>
        <LivePublishingBridge token="token-1" role="follower" gpsSuppressedUntil={null} />
      </TripContextTestProvider>,
    );
    await flush();
    expect(native.configure).not.toHaveBeenCalled();
  });

  it("contains a failing settings query instead of unmounting the app", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.throwCloakingPins = true;

    render(<Harness value={enabled(AUTUMN)} />);
    await flush();

    expect(screen.getByTestId("map")).toBeInTheDocument();
    expect(native.configure).not.toHaveBeenCalled();
  });
});

describe("LivePublishingBridge ending live sharing on a trip change", () => {
  it("turns sharing off once when the epoch changes while live, before configuring the new epoch", async () => {
    setLiveSharingEnabled(true);
    const { rerender } = render(<Harness value={enabled(AUTUMN)} />);
    await flush();
    expect(getLiveSharingEnabled()).toBe(true);

    rerender(<Harness value={enabled(SUMMER)} />);
    await flush();

    expect(getLiveSharingEnabled()).toBe(false);
    expect(notices).toEqual(["Live sharing stopped: Followers now see Summer 2026."]);
    expect(lastConfig()).toMatchObject({ captureTripId: SUMMER.tripId, publishingEpoch: 4 });
    expect(native.liveAtConfigure.at(-1)).toBe(false);
    expect(native.retry).toHaveBeenCalledTimes(1);

    rerender(<Harness value={enabled(SUMMER, { followerTrip: null })} mapKey={1} />);
    act(() => requestNativePublishingRetry());
    await flush();
    expect(getLiveSharingEnabled()).toBe(false);
    expect(notices).toHaveLength(1);
    expect(native.retry).toHaveBeenCalledTimes(1);
  });

  it("posts no notice for a switch while not live", async () => {
    const { rerender } = render(<Harness value={enabled(AUTUMN)} />);
    await flush();
    rerender(<Harness value={enabled(SUMMER)} />);
    await flush();

    expect(notices).toEqual([]);
    expect(getLiveSharingEnabled()).toBe(false);
  });

  it("ends sharing for a switch made while the app was closed", async () => {
    localStorage.setItem(`tripcast.live-sharing.last-epoch.${tokenScope("token-1")}`, "3");
    setLiveSharingEnabled(true);

    render(<Harness value={enabled(SUMMER)} />);
    await flush();

    expect(getLiveSharingEnabled()).toBe(false);
    expect(notices).toEqual(["Live sharing stopped: Followers now see Summer 2026."]);
  });

  it("does not stop sharing when multi-trip turns on or flickers off and back on the same epoch", async () => {
    setLiveSharingEnabled(true);
    const { rerender } = render(<Harness value={{}} />);
    await flush();
    rerender(<Harness value={enabled(AUTUMN)} />);
    rerender(<Harness value={{}} />);
    rerender(<Harness value={enabled(AUTUMN)} />);
    await flush();

    expect(getLiveSharingEnabled()).toBe(true);
    expect(notices).toEqual([]);
  });

  it("turns sharing off and clears a snooze when the phone revokes the session, and never turns it back on", async () => {
    setLiveSharingEnabled(true);
    const { rerender } = render(<Harness value={enabled(AUTUMN)} />);
    await flush();

    const retriesWhileLive = native.retry.mock.calls.length;
    act(() => reportNativePublishingRevoked({ reason: "trip-changed", epoch: 3 }));
    expect(getLiveSharingEnabled()).toBe(false);
    expect(notices).toEqual(["Live sharing stopped: Followers now see Autumn 2026."]);

    rerender(<Harness value={enabled(AUTUMN, { followerTrip: null })} mapKey={1} />);
    act(() => requestNativePublishingRetry());
    await flush();
    expect(getLiveSharingEnabled()).toBe(false);
    expect(native.retry).toHaveBeenCalledTimes(retriesWhileLive);

    writeLiveSnooze(Date.now() + 60 * 60 * 1000);
    act(() => reportNativePublishingRevoked({ reason: "trip-changed", epoch: 3 }));
    expect(readLiveSnooze()).toBeNull();
    expect(getLiveSharingEnabled()).toBe(false);
    expect(notices).toHaveLength(2);
  });

  it("asks to tap Live again when the phone reports tags introduced", async () => {
    setLiveSharingEnabled(true);
    render(<Harness value={enabled(AUTUMN)} />);
    await flush();

    act(() => reportNativePublishingRevoked({ reason: "tags-introduced", epoch: 3 }));

    expect(getLiveSharingEnabled()).toBe(false);
    expect(notices).toEqual(["Live sharing stopped. Tap Live to resume."]);
  });

  it("shows one notice when the epoch change arrives before the revoke", async () => {
    setLiveSharingEnabled(true);
    const { rerender } = render(<Harness value={enabled(AUTUMN)} />);
    await flush();

    rerender(<Harness value={enabled(SUMMER)} />);
    await flush();
    act(() => reportNativePublishingRevoked({ reason: "trip-changed", epoch: 4 }));

    expect(notices).toEqual(["Live sharing stopped: Followers now see Summer 2026."]);
  });

  it("shows one notice, naming the new trip, when the revoke arrives before the epoch change", async () => {
    setLiveSharingEnabled(true);
    const { rerender } = render(<Harness value={enabled(AUTUMN)} />);
    await flush();

    act(() => reportNativePublishingRevoked({ reason: "trip-changed", epoch: 4 }));
    expect(getLiveSharingEnabled()).toBe(false);
    expect(notices).toEqual([]);

    rerender(<Harness value={enabled(SUMMER)} />);
    await flush();

    expect(notices).toEqual(["Live sharing stopped: Followers now see Summer 2026."]);
    expect(getLiveSharingEnabled()).toBe(false);
  });
});

describe("native revoke routing", () => {
  it("delivers the phone's gps:native-publish:revoked event to the bridge", async () => {
    setLiveSharingEnabled(true);
    render(<Harness value={enabled(AUTUMN)} />);
    await flush();
    plugin.configurePublishing.mockResolvedValue({
      action: "gps:native-publish:revoked",
      level: "warn",
      details: { source: "upload", reason: "tags-introduced", capturing: true, queueDepth: 2 },
    });

    await act(async () => {
      await nativeLocationManager.configurePublishing({
        endpoint: "https://example.invalid",
        token: "token-1",
        liveTrailEnabled: true,
        movementDetectionEnabled: false,
        emissionIntervalSeconds: 15,
        alertThresholdSeconds: 120,
        cloakTimeoutSeconds: 300,
        cloakZones: [],
        includeDebugMysteryMissions: false,
      });
    });

    expect(getLiveSharingEnabled()).toBe(false);
    expect(notices).toEqual(["Live sharing stopped. Tap Live to resume."]);
  });
});

const AUTUMN_TAGS = { tripId: AUTUMN.tripId, publishingEpoch: AUTUMN.publishingEpoch, tripTitle: AUTUMN.title };
const LOADING: Partial<TripContextValue> = { serverTripStatus: "loading" };
const UNAVAILABLE: Partial<TripContextValue> = { serverTripStatus: "unavailable" };
const TODAYS_KEYS = [
  "alertThresholdSeconds",
  "cloakTimeoutSeconds",
  "cloakZones",
  "emissionIntervalSeconds",
  "endpoint",
  "includeDebugMysteryMissions",
  "liveTrailEnabled",
  "movementDetectionEnabled",
  "token",
  "usageGuard",
];

function configs(): Array<Record<string, unknown>> {
  return native.configure.mock.calls.map((call) => call[0] as Record<string, unknown>);
}

describe("LivePublishingBridge across cold launches and trip-state outages", () => {
  it("cold launch with multi-trip known on and Live on: exactly one configure, never untagged, Live kept", async () => {
    writePublishingIdentity("token-1", AUTUMN_TAGS);
    localStorage.setItem(`tripcast.live-sharing.last-epoch.${tokenScope("token-1")}`, "3");
    setLiveSharingEnabled(true);

    const { rerender } = render(<Harness value={LOADING} />);
    await flush();
    expect(native.configure).toHaveBeenCalledTimes(1);
    expect(lastConfig()).toMatchObject({
      captureTripId: AUTUMN.tripId,
      publishingEpoch: 3,
      usageGuard: { bytesPerUpload: 5100 },
    });
    expect(getNativePublishingTags()).toEqual(AUTUMN_TAGS);

    rerender(<Harness value={enabled(AUTUMN)} />);
    await flush();

    expect(native.configure).toHaveBeenCalledTimes(1);
    for (const config of configs()) expect(config).toHaveProperty("captureTripId", AUTUMN.tripId);
    expect(getLiveSharingEnabled()).toBe(true);
    expect(notices).toEqual([]);
  });

  it("an error and recovery of the current-trip query causes zero reconfigures", async () => {
    setLiveSharingEnabled(true);
    const { rerender } = render(<Harness value={enabled(AUTUMN)} />);
    await flush();
    expect(native.configure).toHaveBeenCalledTimes(1);

    rerender(<Harness value={UNAVAILABLE} />);
    await flush();
    expect(getNativePublishingTags()).toEqual(AUTUMN_TAGS);
    rerender(<Harness value={LOADING} />);
    rerender(<Harness value={enabled(AUTUMN)} />);
    await flush();

    expect(native.configure).toHaveBeenCalledTimes(1);
    expect(getLiveSharingEnabled()).toBe(true);
    expect(notices).toEqual([]);
  });

  it("first-ever launch: waits briefly for a loading trip state, then configures untagged as today", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<Harness value={LOADING} />);
    await flush();
    expect(native.configure).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(FIRST_LAUNCH_WAIT_MS - 1));
    await flush();
    expect(native.configure).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    await flush();

    expect(native.configure).toHaveBeenCalledTimes(1);
    expect(Object.keys(lastConfig()).sort()).toEqual(TODAYS_KEYS);
    expect(lastConfig().usageGuard).toEqual({ bytesPerUpload: 4500, monthlyLimitBytes: 1_000_000_000, pausePercent: 99 });
  });

  it("first-ever launch: a trip state resolved within the wait gives one configure for it", async () => {
    const { rerender } = render(<Harness value={LOADING} />);
    await flush();
    rerender(<Harness value={enabled(AUTUMN)} />);
    await flush();

    expect(native.configure).toHaveBeenCalledTimes(1);
    expect(lastConfig()).toMatchObject({ captureTripId: AUTUMN.tripId, publishingEpoch: 3 });
  });

  it("configures untagged at once when nothing was ever known and the trip state fails, or multi-trip was last off", async () => {
    const { unmount } = render(<Harness value={UNAVAILABLE} />);
    await flush();
    expect(native.configure).toHaveBeenCalledTimes(1);
    expect(Object.keys(lastConfig()).sort()).toEqual(TODAYS_KEYS);
    unmount();

    native.configure.mockClear();
    writePublishingIdentity("token-1", null);
    render(<Harness value={LOADING} />);
    await flush();
    expect(native.configure).toHaveBeenCalledTimes(1);
    expect(Object.keys(lastConfig()).sort()).toEqual(TODAYS_KEYS);
  });

  it("forgets the remembered identity and last epoch of one token on sign-out", async () => {
    const identityKey = (token: string) => `tripcast.live-publishing.identity.${tokenScope(token)}`;
    const lastEpochKey = (token: string) => `tripcast.live-sharing.last-epoch.${tokenScope(token)}`;
    writePublishingIdentity("token-1", AUTUMN_TAGS);
    writePublishingIdentity("other-token", AUTUMN_TAGS);
    localStorage.setItem(lastEpochKey("token-1"), "3");
    localStorage.setItem(lastEpochKey("other-token"), "3");
    expect(localStorage.getItem(identityKey("token-1"))).toContain("Autumn 2026");

    clearPublishingIdentity("token-1");

    expect(localStorage.getItem(identityKey("token-1"))).toBeNull();
    expect(localStorage.getItem(lastEpochKey("token-1"))).toBeNull();
    expect(localStorage.getItem(identityKey("other-token"))).toContain("Autumn 2026");
    expect(localStorage.getItem(lastEpochKey("other-token"))).toBe("3");

    // The next launch with that token is a first launch: nothing remembered, so nothing is configured yet.
    render(<Harness value={LOADING} />);
    await flush();
    expect(native.configure).not.toHaveBeenCalled();
    expect(getNativePublishingTags()).toBeNull();
  });

  it("scopes the remembered identity to the session token", async () => {
    writePublishingIdentity("other-token", AUTUMN_TAGS);
    render(<Harness value={LOADING} />);
    await flush();

    expect(native.configure).not.toHaveBeenCalled();
    expect(getNativePublishingTags()).toBeNull();
  });

  it("a switch made while the app was closed still ends Live once after a cold launch", async () => {
    writePublishingIdentity("token-1", AUTUMN_TAGS);
    localStorage.setItem(`tripcast.live-sharing.last-epoch.${tokenScope("token-1")}`, "3");
    setLiveSharingEnabled(true);

    const { rerender } = render(<Harness value={LOADING} />);
    await flush();
    expect(getLiveSharingEnabled()).toBe(true);
    rerender(<Harness value={enabled(SUMMER)} />);
    await flush();
    act(() => reportNativePublishingRevoked({ reason: "trip-changed", epoch: 4 }));

    expect(getLiveSharingEnabled()).toBe(false);
    expect(notices).toEqual(["Live sharing stopped: Followers now see Summer 2026."]);
    expect(native.configure).toHaveBeenCalledTimes(2);
    expect(lastConfig()).toMatchObject({ captureTripId: SUMMER.tripId, publishingEpoch: 4 });
    expect(native.liveAtConfigure.at(-1)).toBe(false);
  });

  it("keeps ending Live on a trip change while a settings query is failing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.throwCloakingPins = true;
    setLiveSharingEnabled(true);
    const { rerender } = render(<Harness value={enabled(AUTUMN)} />);
    await flush();
    expect(native.configure).not.toHaveBeenCalled();

    rerender(<Harness value={enabled(SUMMER)} />);
    await flush();

    expect(getLiveSharingEnabled()).toBe(false);
    expect(notices).toEqual(["Live sharing stopped: Followers now see Summer 2026."]);
  });

  it("at a switch between trips whose live-trail settings differ: one tags-only configure, then one full", async () => {
    server.liveTrailByTrip = { [AUTUMN.tripId]: true, [SUMMER.tripId]: false };
    const { rerender } = render(<Harness value={enabled(AUTUMN)} />);
    await flush();
    expect(native.configure).toHaveBeenCalledTimes(1);

    server.loadingTrips.add(SUMMER.tripId);
    rerender(<Harness value={enabled(SUMMER)} />);
    await flush();
    // Tags-only: the new trip's tags with the settings held from the old trip while the new ones load.
    expect(native.configure).toHaveBeenCalledTimes(2);
    expect(lastConfig()).toMatchObject({ captureTripId: SUMMER.tripId, liveTrailEnabled: true });

    server.loadingTrips.delete(SUMMER.tripId);
    rerender(<Harness value={enabled(SUMMER)} />);
    await flush();
    expect(native.configure).toHaveBeenCalledTimes(3);
    expect(lastConfig()).toMatchObject({ captureTripId: SUMMER.tripId, liveTrailEnabled: false });
  });
});

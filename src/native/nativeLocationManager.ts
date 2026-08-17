import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type {
  BackgroundGeolocationPlugin,
  Location,
  CallbackError,
} from "@capgo/background-geolocation";
import { debugLoggerFor } from "../debug/useDebugLogger";
import {
  resetNativePublishingState,
  setNativePublishingState,
  type NativePublishingPhase,
} from "./nativePublishingState";
import { setNativeTrackingMode, type NativeTrackingMode } from "./nativeTrackingState";

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  "BackgroundGeolocation",
);

type AdaptiveLocationEvent = {
  mode: Exclude<NativeTrackingMode, "legacy">;
  liveRequested: boolean;
  changedAt: number;
  reason?: string;
  lat?: number;
  lon?: number;
  accuracy?: number;
  speed?: number;
  timestamp?: number;
  error?: string;
  code?: number;
  action?: string;
  level?: "info" | "warn" | "error";
  details?: Record<string, unknown>;
  publishingPhase?: NativePublishingPhase;
  queueDepth?: number;
  breadcrumbQueueDepth?: number;
  capacityReached?: boolean;
  completedDrainCount?: number;
};

export type NativePublishingConfiguration = {
  endpoint: string;
  token: string;
  liveTrailEnabled: boolean;
  alertThresholdSeconds: number;
  cloakTimeoutSeconds: number;
  cloakZones: Array<{ lat: number; lon: number; radiusMeters: number }>;
};

interface AdaptiveLocationPlugin {
  start(): Promise<AdaptiveLocationEvent>;
  stop(options?: NativeStopOptions): Promise<AdaptiveLocationEvent>;
  configurePublishing(options: NativePublishingConfiguration): Promise<AdaptiveLocationEvent>;
  foreground(): Promise<AdaptiveLocationEvent>;
  setCalibrationActive(options: { active: boolean }): Promise<AdaptiveLocationEvent>;
  getState(): Promise<AdaptiveLocationEvent>;
  addListener(
    eventName: "locationUpdate",
    listener: (event: AdaptiveLocationEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export type NativeStopOptions = {
  clearCredentials?: boolean;
  pendingSamples?: "discard" | "preserve";
};

const AdaptiveLocation = registerPlugin<AdaptiveLocationPlugin>("AdaptiveLocation");
const log = debugLoggerFor(
  "NativeLocationManager",
  "src/native/nativeLocationManager.ts",
);

export type NativeLocationFix = {
  lat: number;
  lon: number;
  accuracy?: number;
  speed?: number;
  at: number;
};

export type WatcherOptions = {
  distanceFilter: number;
  backgroundMessage?: string;
  backgroundTitle?: string;
  requestPermissions?: boolean;
  purpose?: "live" | "calibration";
  adaptive?: boolean;
  highFrequency?: boolean;
};

export type WatcherCallback = (fix: NativeLocationFix) => void;
export type ErrorCallback = (error: unknown) => void;

type WatcherRecord = {
  id: string;
  options: WatcherOptions;
  onFix: WatcherCallback;
  onError: ErrorCallback;
};

class NativeLocationManager {
  private watchers: WatcherRecord[] = [];
  private isStarted = false;
  private currentOptions: WatcherOptions | null = null;
  private adaptiveStarted = false;
  private adaptiveListener: PluginListenerHandle | null = null;
  private nextId = 1;
  private syncPromise: Promise<void> = Promise.resolve();
  private lastCallbackAt: number | null = null;
  private hasAttemptedAlreadyStartedRecovery = false;

  public addWatcher(
    options: WatcherOptions,
    onFix: WatcherCallback,
    onError: ErrorCallback,
  ): string {
    const id = String(this.nextId++);
    this.watchers.push({ id, options, onFix, onError });
    this.scheduleSync();
    return id;
  }

  public removeWatcher(id: string): void {
    this.watchers = this.watchers.filter((watcher) => watcher.id !== id);
    this.scheduleSync();
  }

  public openSettings(): void {
    void BackgroundGeolocation.openSettings();
  }

  public explicitStop(options: NativeStopOptions = {}): void {
    this.adaptiveStarted = false;
    if (this.isStarted) {
      this.isStarted = false;
      this.currentOptions = null;
      void BackgroundGeolocation.stop().catch(() => {});
    }
    void AdaptiveLocation.stop(options).then((event) => {
      this.applyAdaptiveState(event);
    }).catch((error) => {
      log.error("gps:adaptive:stop:failure", "error", {
        errorType: error instanceof Error ? error.name : typeof error,
      });
    });
    setNativeTrackingMode("off");
    if (options.pendingSamples !== "preserve") resetNativePublishingState();
  }

  public isAdaptiveActive(): boolean {
    return this.adaptiveStarted;
  }

  public async configurePublishing(options: NativePublishingConfiguration): Promise<void> {
    const state = await AdaptiveLocation.configurePublishing(options);
    this.applyAdaptiveState(state);
  }

  public foreground(): void {
    void AdaptiveLocation.foreground().then((state) => this.applyAdaptiveState(state)).catch((error) => {
      log.error("gps:adaptive:foreground:failure", "error", {
        errorType: error instanceof Error ? error.name : typeof error,
      });
    });
  }

  private scheduleSync(): void {
    this.syncPromise = this.syncPromise
      .then(() => this.syncPlugin())
      .catch((error) => {
        log.error("gps:native:sync:error", "error", {
          errorType: error instanceof Error ? error.name : typeof error,
        });
        this.watchers.forEach((watcher) => watcher.onError(error));
      });
  }

  private scheduleAlreadyStartedRecovery(): void {
    if (this.hasAttemptedAlreadyStartedRecovery) return;
    this.hasAttemptedAlreadyStartedRecovery = true;
    this.syncPromise = this.syncPromise
      .then(async () => {
        await BackgroundGeolocation.stop();
        this.isStarted = false;
        this.currentOptions = null;
        this.lastCallbackAt = null;
        await this.syncPlugin();
      })
      .catch((error) => {
        this.watchers.forEach((watcher) => watcher.onError(error));
      });
  }

  private async syncPlugin(): Promise<void> {
    const adaptiveLive = this.watchers.some(
      (watcher) => watcher.options.purpose === "live" && watcher.options.adaptive === true,
    );

    if (adaptiveLive) {
      await this.syncAdaptivePlugin();
      return;
    }

    // A disappearing WebView removes its JavaScript listeners. Adaptive Live
    // remains a native request until an explicit Live-off/sign-out/reset.
    if (this.watchers.length === 0) {
      if (this.isStarted) {
        await BackgroundGeolocation.stop();
        this.isStarted = false;
        this.currentOptions = null;
        setNativeTrackingMode("off");
      }
      return;
    }

    if (this.adaptiveStarted) {
      this.adaptiveStarted = false;
      await AdaptiveLocation.stop();
    }

    const aggregated = this.aggregateOptions();
    if (this.isStarted && this.isSameOptions(aggregated, this.currentOptions)) return;

    if (this.isStarted) {
      await BackgroundGeolocation.stop();
      this.isStarted = false;
    }

    try {
      await BackgroundGeolocation.start(
        {
          distanceFilter: aggregated.distanceFilter,
          backgroundMessage: aggregated.backgroundMessage,
          backgroundTitle: aggregated.backgroundTitle,
          requestPermissions: aggregated.requestPermissions,
        },
        (location?: Location, error?: CallbackError) => {
          if (error) {
            if (error.code === "ALREADY_STARTED" && !this.hasAttemptedAlreadyStartedRecovery) {
              this.scheduleAlreadyStartedRecovery();
              return;
            }
            this.watchers.forEach((watcher) => watcher.onError(error));
            return;
          }
          if (!location) return;
          const now = Date.now();
          log.logGps("gps:native:callback:received", {
            gapMs: this.lastCallbackAt === null ? null : now - this.lastCallbackAt,
            watcherCount: this.watchers.length,
            hasAccuracy: typeof location.accuracy === "number",
            hasSpeed: typeof location.speed === "number" && location.speed >= 0,
          });
          this.lastCallbackAt = now;
          const fix: NativeLocationFix = {
            lat: location.latitude,
            lon: location.longitude,
            accuracy: location.accuracy,
            speed:
              typeof location.speed === "number" && location.speed >= 0
                ? location.speed
                : undefined,
            at: now,
          };
          this.watchers.forEach((watcher) => watcher.onFix(fix));
        },
      );
      this.isStarted = true;
      this.currentOptions = aggregated;
      setNativeTrackingMode("legacy");
    } catch (error) {
      this.watchers.forEach((watcher) => watcher.onError(error));
    }
  }

  private async syncAdaptivePlugin(): Promise<void> {
    if (this.isStarted) {
      await BackgroundGeolocation.stop();
      this.isStarted = false;
      this.currentOptions = null;
    }

    if (!this.adaptiveListener) {
      this.adaptiveListener = await AdaptiveLocation.addListener(
        "locationUpdate",
        (event) => this.handleAdaptiveEvent(event),
      );
    }

    const state = this.adaptiveStarted
      ? await AdaptiveLocation.getState()
      : await AdaptiveLocation.start();
    this.adaptiveStarted = true;
    this.applyAdaptiveState(state);
    const calibratedState = await AdaptiveLocation.setCalibrationActive({
      active: this.watchers.some(
        (watcher) =>
          watcher.options.purpose === "calibration" || watcher.options.highFrequency === true,
      ),
    });
    this.applyAdaptiveState(calibratedState);
  }

  private handleAdaptiveEvent(event: AdaptiveLocationEvent): void {
    this.applyAdaptiveState(event);
    if (event.error) {
      this.watchers.forEach((watcher) => watcher.onError({
        code: event.code,
        message: event.error,
      }));
      return;
    }
    if (typeof event.lat !== "number" || typeof event.lon !== "number") return;
    log.logGps("gps:adaptive:callback:received", {
      mode: event.mode,
      watcherCount: this.watchers.length,
      hasAccuracy: typeof event.accuracy === "number",
      hasSpeed: typeof event.speed === "number",
    });
    const fix: NativeLocationFix = {
      lat: event.lat,
      lon: event.lon,
      accuracy: event.accuracy,
      speed: event.speed,
      at: event.timestamp ?? Date.now(),
    };
    this.watchers.forEach((watcher) => watcher.onFix(fix));
  }

  private applyAdaptiveState(event: AdaptiveLocationEvent): void {
    if (
      event.publishingPhase ||
      typeof event.queueDepth === "number" ||
      typeof event.breadcrumbQueueDepth === "number"
    ) {
      setNativePublishingState({
        ...(event.publishingPhase ? { phase: event.publishingPhase } : {}),
        ...(typeof event.queueDepth === "number" ? { queueDepth: event.queueDepth } : {}),
        ...(typeof event.breadcrumbQueueDepth === "number"
          ? { breadcrumbQueueDepth: event.breadcrumbQueueDepth }
          : {}),
        ...(typeof event.capacityReached === "boolean"
          ? { capacityReached: event.capacityReached }
          : {}),
        ...(typeof event.completedDrainCount === "number"
          ? { completedDrainCount: event.completedDrainCount }
          : {}),
      });
    }
    if (event.action) {
      log.logGps(event.action, event.details ?? {}, event.level === "warn" ? "warn" : undefined);
    }
    if (!event.mode) return;
    log.logGps("gps:adaptive:mode", {
      mode: event.mode,
      liveRequested: event.liveRequested,
      changedAt: event.changedAt,
      reason: event.reason,
    });
    setNativeTrackingMode(event.mode, event.changedAt);
  }

  private aggregateOptions(): WatcherOptions {
    let minDistanceFilter = Infinity;
    let backgroundMessage: string | undefined;
    let backgroundTitle: string | undefined;
    let requestPermissions = false;

    for (const watcher of this.watchers) {
      minDistanceFilter = Math.min(minDistanceFilter, watcher.options.distanceFilter);
      backgroundMessage = watcher.options.backgroundMessage ?? backgroundMessage;
      backgroundTitle = watcher.options.backgroundTitle ?? backgroundTitle;
      requestPermissions ||= watcher.options.requestPermissions === true;
    }

    return {
      distanceFilter: minDistanceFilter === Infinity ? 0 : minDistanceFilter,
      backgroundMessage,
      backgroundTitle,
      requestPermissions,
    };
  }

  private isSameOptions(a: WatcherOptions, b: WatcherOptions | null): boolean {
    if (!b) return false;
    return (
      a.distanceFilter === b.distanceFilter &&
      a.backgroundMessage === b.backgroundMessage &&
      a.backgroundTitle === b.backgroundTitle &&
      a.requestPermissions === b.requestPermissions
    );
  }
}

export const nativeLocationManager = new NativeLocationManager();

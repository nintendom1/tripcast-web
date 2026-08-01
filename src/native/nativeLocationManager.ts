import { registerPlugin } from "@capacitor/core";
import type {
  BackgroundGeolocationPlugin,
  Location,
  CallbackError,
} from "@capgo/background-geolocation";
import { debugLoggerFor } from "../debug/useDebugLogger";

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  "BackgroundGeolocation",
);
const log = debugLoggerFor(
  "NativeLocationManager",
  "src/native/nativeLocationManager.ts",
);

export type NativeLocationFix = {
  lat: number;
  lon: number;
  accuracy?: number;
  speed?: number;
};

export type WatcherOptions = {
  distanceFilter: number;
  backgroundMessage?: string;
  backgroundTitle?: string;
  requestPermissions?: boolean;
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
    this.watchers = this.watchers.filter((w) => w.id !== id);
    this.scheduleSync();
  }

  public openSettings(): void {
    void BackgroundGeolocation.openSettings();
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
    if (this.hasAttemptedAlreadyStartedRecovery) {
      return;
    }
    this.hasAttemptedAlreadyStartedRecovery = true;
    log.logGps("gps:native:plugin:recovery:request", {
      reason: "already-started",
      watcherCount: this.watchers.length,
    });
    this.syncPromise = this.syncPromise
      .then(async () => {
        log.logGps("gps:native:plugin:stop:request", {
          reason: "already-started-recovery",
        });
        await BackgroundGeolocation.stop();
        this.isStarted = false;
        this.currentOptions = null;
        this.lastCallbackAt = null;
        log.logGps("gps:native:plugin:stop:ack", {
          reason: "already-started-recovery",
        });
        await this.syncPlugin();
      })
      .catch((error) => {
        log.error("gps:native:plugin:recovery:failure", "error", {
          reason: "already-started",
          errorType: error instanceof Error ? error.name : typeof error,
        });
        this.watchers.forEach((watcher) => watcher.onError(error));
      });
  }

  private async syncPlugin(): Promise<void> {
    if (this.watchers.length === 0) {
      if (this.isStarted) {
        log.logGps("gps:native:plugin:stop:request", {
          reason: "no-watchers",
        });
        try {
          await BackgroundGeolocation.stop();
          this.isStarted = false;
          this.currentOptions = null;
          log.logGps("gps:native:plugin:stop:ack", {
            reason: "no-watchers",
          });
        } catch (error) {
          log.error("gps:native:plugin:stop:failure", "error", {
            reason: "no-watchers",
            errorType: error instanceof Error ? error.name : typeof error,
          });
          throw error;
        }
      }
      return;
    }

    const aggregated = this.aggregateOptions();

    if (this.isStarted && this.isSameOptions(aggregated, this.currentOptions)) {
      return;
    }

    if (this.isStarted) {
      log.logGps("gps:native:plugin:stop:request", {
        reason: "options-changed",
      });
      try {
        await BackgroundGeolocation.stop();
        this.isStarted = false;
        log.logGps("gps:native:plugin:stop:ack", {
          reason: "options-changed",
        });
      } catch (error) {
        log.error("gps:native:plugin:stop:failure", "error", {
          reason: "options-changed",
          errorType: error instanceof Error ? error.name : typeof error,
        });
        throw error;
      }
    }

    try {
      log.logGps("gps:native:plugin:start:request", {
        watcherCount: this.watchers.length,
        distanceFilterMeters: aggregated.distanceFilter,
        requestPermissions: aggregated.requestPermissions ?? false,
      });
      await BackgroundGeolocation.start(
        {
          distanceFilter: aggregated.distanceFilter,
          backgroundMessage: aggregated.backgroundMessage,
          backgroundTitle: aggregated.backgroundTitle,
          requestPermissions: aggregated.requestPermissions,
        },
        (location?: Location, error?: CallbackError) => {
          if (error) {
            if (error.code === "ALREADY_STARTED") {
              if (!this.hasAttemptedAlreadyStartedRecovery) {
                log.logGps("gps:native:callback:already-started", {
                  watcherCount: this.watchers.length,
                });
                this.scheduleAlreadyStartedRecovery();
                return;
              }
            }
            log.error("gps:native:callback:error", "error", {
              code: error.code,
            });
            this.watchers.forEach((w) => w.onError(error));
            return;
          }
          if (location) {
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
            };
            this.watchers.forEach((w) => w.onFix(fix));
          }
        },
      );
      this.isStarted = true;
      this.currentOptions = aggregated;
      log.logGps("gps:native:plugin:start:ack", {
        watcherCount: this.watchers.length,
        distanceFilterMeters: aggregated.distanceFilter,
      });
    } catch (e) {
      log.error("gps:native:plugin:start:failure", "error", {
        errorType: e instanceof Error ? e.name : typeof e,
      });
      this.watchers.forEach((w) => w.onError(e));
    }
  }

  private aggregateOptions(): WatcherOptions {
    let minDistanceFilter = Infinity;
    let backgroundMessage: string | undefined;
    let backgroundTitle: string | undefined;
    let requestPermissions = false;

    for (const w of this.watchers) {
      minDistanceFilter = Math.min(minDistanceFilter, w.options.distanceFilter);
      if (w.options.backgroundMessage) {
        backgroundMessage = w.options.backgroundMessage;
      }
      if (w.options.backgroundTitle) {
        backgroundTitle = w.options.backgroundTitle;
      }
      if (w.options.requestPermissions) {
        requestPermissions = true;
      }
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

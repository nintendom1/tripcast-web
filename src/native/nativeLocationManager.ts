import { registerPlugin } from "@capacitor/core";
import type {
  BackgroundGeolocationPlugin,
  Location,
  CallbackError,
} from "@capgo/background-geolocation";

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  "BackgroundGeolocation",
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
    this.syncPromise = this.syncPromise.then(() => this.syncPlugin());
  }

  private async syncPlugin(): Promise<void> {
    if (this.watchers.length === 0) {
      if (this.isStarted) {
        await BackgroundGeolocation.stop();
        this.isStarted = false;
        this.currentOptions = null;
      }
      return;
    }

    const aggregated = this.aggregateOptions();

    if (this.isStarted && this.isSameOptions(aggregated, this.currentOptions)) {
      return;
    }

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
            this.watchers.forEach((w) => w.onError(error));
            return;
          }
          if (location) {
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
    } catch (e) {
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

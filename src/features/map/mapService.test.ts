import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearMapCooldown,
  getActiveMapCooldown,
  getMapStyleUrl,
  MAP_COOLDOWN_BACKOFF_MS,
  MAP_COOLDOWN_EVENT,
  MAP_COOLDOWN_KEY,
  readMapCooldownState,
  triggerMapCooldown,
} from "./mapService";

afterEach(() => {
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

describe("mapService", () => {
  it("builds the style URL from VITE_CONVEX_SITE_URL", () => {
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://tripcast-site.example.test/");

    expect(getMapStyleUrl()).toBe(
      "https://tripcast-site.example.test/map/style?base=https%3A%2F%2Ftripcast-site.example.test",
    );
  });

  it("derives the local Convex site URL from the local Convex client URL in dev", () => {
    vi.stubEnv("VITE_CONVEX_SITE_URL", "");
    vi.stubEnv("VITE_CONVEX_URL", "http://127.0.0.1:3210");

    expect(getMapStyleUrl()).toBe(
      "http://127.0.0.1:3211/map/style?base=http%3A%2F%2F127.0.0.1%3A3211",
    );
  });

  it("derives the production Convex site URL from the Convex client URL", () => {
    vi.stubEnv("VITE_CONVEX_SITE_URL", "");
    const deployment = "steady-otter-123";
    const cloudHost = [deployment, "convex", "cloud"].join(".");
    const siteHost = [deployment, "convex", "site"].join(".");
    vi.stubEnv("VITE_CONVEX_URL", `https://${cloudHost}`);

    expect(getMapStyleUrl()).toBe(
      `https://${siteHost}/map/style?base=${encodeURIComponent(`https://${siteHost}`)}`,
    );
  });

  it("stores and announces a progressive cooldown", () => {
    const listener = vi.fn();
    window.addEventListener(MAP_COOLDOWN_EVENT, listener);

    const cooldown = triggerMapCooldown(1000);

    expect(cooldown).toEqual({
      until: 61000,
      strikes: 1,
      lastFailureAt: 1000,
      backoffMs: MAP_COOLDOWN_BACKOFF_MS[0],
    });
    expect(JSON.parse(sessionStorage.getItem(MAP_COOLDOWN_KEY) ?? "{}")).toMatchObject(cooldown);
    expect(getActiveMapCooldown(1000)).toBe(61000);
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(MAP_COOLDOWN_EVENT, listener);
  });

  it("escalates cooldowns and caps at 30 minutes", () => {
    expect(triggerMapCooldown(1000).backoffMs).toBe(60_000);
    expect(triggerMapCooldown(2000).backoffMs).toBe(5 * 60_000);
    expect(triggerMapCooldown(3000).backoffMs).toBe(15 * 60_000);
    expect(triggerMapCooldown(4000).backoffMs).toBe(30 * 60_000);
    expect(triggerMapCooldown(5000).backoffMs).toBe(30 * 60_000);
    expect(readMapCooldownState(5000).strikes).toBe(5);
  });

  it("resets cooldown strikes after an hour without failures", () => {
    triggerMapCooldown(1000);
    const cooldown = triggerMapCooldown(1000 + 61 * 60_000);

    expect(cooldown.strikes).toBe(1);
    expect(cooldown.backoffMs).toBe(60_000);
  });

  it("clears the active cooldown while preserving strike history", () => {
    triggerMapCooldown(1000);
    const cleared = clearMapCooldown(2000);

    expect(cleared).toEqual({
      until: null,
      strikes: 1,
      lastFailureAt: 1000,
      backoffMs: null,
    });
    expect(getActiveMapCooldown(2000)).toBeNull();
    expect(triggerMapCooldown(3000).backoffMs).toBe(5 * 60_000);
  });

  it("reads legacy numeric cooldowns", () => {
    sessionStorage.setItem(MAP_COOLDOWN_KEY, "1000");

    expect(getActiveMapCooldown(999)).toBe(1000);
    expect(readMapCooldownState(999)).toMatchObject({
      until: 1000,
      strikes: 1,
    });
  });

  it("clears expired legacy cooldowns", () => {
    sessionStorage.setItem(MAP_COOLDOWN_KEY, "1000");

    expect(getActiveMapCooldown(1001)).toBeNull();
    expect(sessionStorage.getItem(MAP_COOLDOWN_KEY)).toBeNull();
  });
});

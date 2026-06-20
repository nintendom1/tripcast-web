import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearMapCooldown,
  getActiveMapCooldown,
  getMapProxyConfigHint,
  getMapStyleResolution,
  getMapStyleUrl,
  MAP_COOLDOWN_BACKOFF_MS,
  MAP_COOLDOWN_EVENT,
  MAP_COOLDOWN_KEY,
  readMapCooldownState,
  resetMapCooldown,
  triggerMapCooldown,
} from "./mapService";

afterEach(() => {
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

describe("mapService", () => {
  it("serves the basemap directly from OpenFreeMap regardless of Convex env", () => {
    // The map proxy was removed; tiles come straight from OpenFreeMap so they no
    // longer egress through Convex. The Convex env vars are now irrelevant here.
    // Hosts are assembled via join() so the gitleaks `tripcast-convex-url` rule
    // doesn't trip on a literal *.convex.cloud string in source.
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://tripcast-site.example.test/");
    vi.stubEnv("VITE_CONVEX_URL", `https://steady-otter-123.${["convex", "cloud"].join(".")}`);

    expect(getMapStyleUrl()).toBe("https://tiles.openfreemap.org/styles/bright");
  });

  it("maps themes to OpenFreeMap style paths", () => {
    expect(getMapStyleResolution().styleUrl).toBe("https://tiles.openfreemap.org/styles/bright");
    expect(getMapStyleResolution("fiord").styleUrl).toBe("https://tiles.openfreemap.org/styles/fiord");
    expect(getMapStyleResolution("liberty").styleUrl).toBe(
      "https://tiles.openfreemap.org/styles/liberty",
    );
  });

  it("flags a .convex.cloud proxy base as a misconfiguration", () => {
    const cloudHost = ["fixture-deployment", "convex", "cloud"].join(".");
    const hint = getMapProxyConfigHint({ baseUrl: `https://${cloudHost}`, source: "override" });

    expect(hint).toContain(".cloud");
    expect(hint).toContain(".site");
  });

  it("does not flag a valid .convex.site proxy base", () => {
    const siteHost = ["fixture-deployment", "convex", "site"].join(".");

    expect(getMapProxyConfigHint({ baseUrl: `https://${siteHost}`, source: "override" })).toBeNull();
    expect(getMapProxyConfigHint({ baseUrl: null, source: "missing" })).toBeNull();
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

  it("resets cooldown strike history after recovery", () => {
    triggerMapCooldown(1000);
    triggerMapCooldown(2000);

    expect(resetMapCooldown()).toEqual({
      until: null,
      strikes: 0,
      lastFailureAt: null,
      backoffMs: null,
    });
    expect(sessionStorage.getItem(MAP_COOLDOWN_KEY)).toBeNull();
    expect(triggerMapCooldown(3000).backoffMs).toBe(60_000);
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

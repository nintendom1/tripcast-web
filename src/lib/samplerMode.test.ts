import { afterEach, describe, expect, it, vi } from "vitest";

describe("samplerMode", () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("reads a stored legacy mode back as relevant", async () => {
    localStorage.setItem("tripcast.liveTrail.samplerMode", "legacy");
    vi.resetModules();
    const { getSamplerMode } = await import("./samplerMode");
    expect(getSamplerMode()).toBe("relevant");
  });

  it("keeps a stored precise mode", async () => {
    localStorage.setItem("tripcast.liveTrail.samplerMode", "precise");
    vi.resetModules();
    const { getSamplerMode } = await import("./samplerMode");
    expect(getSamplerMode()).toBe("precise");
  });
});

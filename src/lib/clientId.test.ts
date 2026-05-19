import { beforeEach, describe, expect, it, vi } from "vitest";

describe("getClientId", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("returns an existing stored client id", async () => {
    localStorage.setItem("tripcast.clientId", "stored-client");
    const { getClientId } = await import("./clientId");

    expect(getClientId()).toBe("stored-client");
  });

  it("creates and stores a random UUID client id", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "uuid-123" });
    const { getClientId } = await import("./clientId");

    expect(getClientId()).toBe("tc_uuid-123");
    expect(localStorage.getItem("tripcast.clientId")).toBe("tc_uuid-123");
  });

  it("reuses the created client id after the first call", async () => {
    let count = 0;
    vi.stubGlobal("crypto", {
      randomUUID: () => {
        count += 1;
        return `uuid-${count}`;
      },
    });
    const { getClientId } = await import("./clientId");

    expect(getClientId()).toBe("tc_uuid-1");
    expect(getClientId()).toBe("tc_uuid-1");
  });
});

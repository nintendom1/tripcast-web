import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nativeMocks = vi.hoisted(() => ({
  isNativeIos: vi.fn(),
  getExpiration: vi.fn(),
}));

vi.mock("../../native/provisioningProfile", () => ({
  isNativeIos: nativeMocks.isNativeIos,
  getProvisioningProfileExpiration: nativeMocks.getExpiration,
}));

import {
  formatExpirationDate,
  formatRemainingTime,
  getCountdownTone,
  IosSideloadProfileCountdown,
  SideloadProfileCountdownRow,
} from "./SideloadProfileCountdownRow";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const NOW = Date.UTC(2026, 6, 24, 9, 0);

describe("SideloadProfileCountdownRow", () => {
  it.each([
    { remaining: 5 * DAY_MS + 3 * HOUR_MS + 2 * MINUTE_MS, label: "5 days, 3 hours, 2 minutes" },
    { remaining: DAY_MS + HOUR_MS + MINUTE_MS, label: "1 day, 1 hour, 1 minute" },
    { remaining: 30 * MINUTE_MS, label: "30 minutes" },
    { remaining: 1, label: "1 minute" },
    { remaining: 0, label: "Expired" },
  ])("formats $remaining milliseconds as $label", ({ remaining, label }) => {
    expect(formatRemainingTime(remaining)).toBe(label);
  });

  it("formats the exact expiration in the requested timezone", () => {
    expect(formatExpirationDate(NOW, "en-US", "UTC")).toBe(
      "Jul 24, 2026, 9:00 AM",
    );
  });

  it.each([
    { remaining: 3 * DAY_MS, tone: "healthy" },
    { remaining: 2 * DAY_MS, tone: "warning" },
    { remaining: DAY_MS, tone: "critical" },
    { remaining: -1, tone: "critical" },
  ] as const)("uses $tone styling at $remaining milliseconds", ({ remaining, tone }) => {
    expect(getCountdownTone(remaining)).toBe(tone);
  });

  it("shows remaining time and the exact expiration date", () => {
    render(
      <SideloadProfileCountdownRow
        expiresAtMs={NOW + 5 * DAY_MS + 3 * HOUR_MS}
        nowMs={NOW}
        locale="en-US"
        timeZone="UTC"
      />,
    );

    expect(screen.getByText("Sideload Profile")).toBeInTheDocument();
    expect(
      screen.getByText("5 days, 3 hours, 0 minutes remaining"),
    ).toHaveClass("text-[var(--green-2)]");
    expect(screen.getByText("Expires Jul 29, 2026, 12:00 PM")).toBeInTheDocument();
  });

  it("shows an expired profile in the critical style", () => {
    render(
      <SideloadProfileCountdownRow
        expiresAtMs={NOW - MINUTE_MS}
        nowMs={NOW}
        locale="en-US"
        timeZone="UTC"
      />,
    );

    expect(screen.getByText("Expired", { selector: ".text-sm" })).toHaveClass(
      "text-[var(--danger)]",
    );
    expect(screen.getByText(/Expired Jul 24, 2026/)).toBeInTheDocument();
  });
});

describe("IosSideloadProfileCountdown", () => {
  beforeEach(() => {
    nativeMocks.isNativeIos.mockReturnValue(false);
    nativeMocks.getExpiration.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is hidden outside native iOS and does not inspect a profile", () => {
    render(<IosSideloadProfileCountdown role="traveler" />);
    expect(screen.queryByText("Sideload Profile")).not.toBeInTheDocument();
    expect(nativeMocks.getExpiration).not.toHaveBeenCalled();
  });

  it("is hidden for followers on native iOS", () => {
    nativeMocks.isNativeIos.mockReturnValue(true);
    render(<IosSideloadProfileCountdown role="follower" />);
    expect(screen.queryByText("Sideload Profile")).not.toBeInTheDocument();
    expect(nativeMocks.getExpiration).not.toHaveBeenCalled();
  });

  it("stays hidden when the native profile is unavailable", async () => {
    nativeMocks.isNativeIos.mockReturnValue(true);
    render(<IosSideloadProfileCountdown role="traveler" />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText("Sideload Profile")).not.toBeInTheDocument();
  });

  it("loads a profile and refreshes the countdown every minute", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    nativeMocks.isNativeIos.mockReturnValue(true);
    nativeMocks.getExpiration.mockResolvedValue(NOW + HOUR_MS + MINUTE_MS);

    render(<IosSideloadProfileCountdown role="traveler" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("1 hour, 1 minute remaining")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(MINUTE_MS);
    });
    expect(screen.getByText("1 hour, 0 minutes remaining")).toBeInTheDocument();
  });

  it("cleans up the refresh interval when unmounted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    nativeMocks.isNativeIos.mockReturnValue(true);
    nativeMocks.getExpiration.mockResolvedValue(NOW + DAY_MS);

    const { unmount } = render(
      <IosSideloadProfileCountdown role="traveler" />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});

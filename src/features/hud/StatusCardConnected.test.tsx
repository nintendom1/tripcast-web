import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { StatusCardConnected } from "./StatusCardConnected";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.mocked(convexReact.useMutation).mockReturnValue(
    vi.fn().mockResolvedValue({ updated: false }) as never,
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StatusCardConnected", () => {
  it("does not render placeholder state meters for Followers when state is hidden", () => {
    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
      if (ref === tripcastApi.travelerState.followerGetTravelerState) {
        return { visible: false };
      }
      if (ref === tripcastApi.travelerAutoState.followerGetAutoState) {
        return { visible: false };
      }
      if (ref === tripcastApi.currentActivity.followerGetCurrentActivity) {
        return {
          _id: "activity-1",
          _creationTime: 1,
          status: "active",
          title: "Museum",
          startedAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBySessionId: "session-1",
          updatedBySessionId: "session-1",
        };
      }
      return undefined;
    });

    render(<StatusCardConnected token="token" role="follower" onOpenState={vi.fn()} />);

    expect(screen.getByText("Museum")).toBeInTheDocument();
    expect(screen.queryByText("Energy")).not.toBeInTheDocument();
    expect(screen.queryByText("Fullness")).not.toBeInTheDocument();
    expect(screen.queryByText("Calm")).not.toBeInTheDocument();
  });

  it("uses plain follower status copy instead of auto-estimate jargon", () => {
    const now = Date.UTC(2024, 0, 1, 20, 7, 0);
    vi.useFakeTimers();
    vi.setSystemTime(now);

    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
      if (ref === tripcastApi.travelerState.followerGetTravelerState) {
        return {
          visible: true,
          energyScore: 60,
          stomachScore: 80,
          stressScore: 20,
          schedulePressureLevel: "comfortable",
          updatedAt: now - 4 * 60 * 60 * 1000,
        };
      }
      if (ref === tripcastApi.travelerAutoState.followerGetAutoState) {
        return {
          visible: true,
          autoStateEnabled: true,
          autoEnabledAt: now - 4 * 60 * 60 * 1000,
          autoTimeZone: "UTC",
          autoBaseEnergyScore: 60,
          autoBaseStomachScore: 80,
          autoBedtimeMinutes: 23 * 60,
          autoWakeTimeMinutes: 8 * 60,
          autoEnergyMin: 0,
          autoEnergyMax: 100,
          autoStomachMin: 0,
          autoStomachMax: 150,
          autoEnergySleepDeltaPerTick: 1,
          autoEnergyAwakeDeltaPerTick: -1,
          autoStomachAwakeDeltaPerTick: -2,
          autoStomachNightAboveHungryEveryTicks: 2,
          autoStomachNightAtOrBelowHungryEveryTicks: 4,
        };
      }
      if (ref === tripcastApi.currentActivity.followerGetCurrentActivity) {
        return null;
      }
      if (ref === tripcastApi.travelerPreferences.followerGetPreferences) {
        return { visible: false };
      }
      return undefined;
    });

    render(<StatusCardConnected token="token" role="follower" onOpenState={vi.fn()} />);

    expect(screen.getByText("Status update")).toBeInTheDocument();
    expect(screen.getByText(/Schedule: Comfortable/)).toBeInTheDocument();
    expect(screen.queryByText(/AUTO EST/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/base saved/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/estimated from that saved status/i)).toBeInTheDocument();
  });

  it("shows one elapsed timer when activity and state timestamps are both present", () => {
    const now = Date.UTC(2024, 0, 1, 20, 7, 0);
    vi.useFakeTimers();
    vi.setSystemTime(now);

    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
      if (ref === tripcastApi.travelerState.travelerGetState) {
        return {
          state: {
            energyScore: 60,
            stomachScore: 80,
            stressScore: 20,
            schedulePressureLevel: "comfortable",
            updatedAt: now - 2 * 60 * 60 * 1000,
          },
          visibility: null,
        };
      }
      if (ref === tripcastApi.currentActivity.travelerGetCurrentActivity) {
        return {
          _id: "activity-1",
          _creationTime: now - 30 * 60 * 1000,
          status: "active",
          title: "Museum",
          startedAt: now - 30 * 60 * 1000,
          createdAt: now - 30 * 60 * 1000,
          updatedAt: now - 30 * 60 * 1000,
          createdBySessionId: "session-1",
          updatedBySessionId: "session-1",
        };
      }
      if (ref === tripcastApi.travelerAutoState.travelerGetAutoState) {
        return {
          autoStateEnabled: false,
          autoTimeZone: "UTC",
          updatedAt: null,
          updatedBySessionId: null,
        };
      }
      if (ref === tripcastApi.travelerPreferences.travelerGetPreferences) {
        return { updatedAt: null };
      }
      return null;
    });

    render(<StatusCardConnected token="token" role="traveler" onOpenState={vi.fn()} />);

    expect(screen.getByText("Museum")).toBeInTheDocument();
    expect(screen.getByText(/for 30m/)).toBeInTheDocument();
    expect(screen.getByText(/Schedule: Comfortable/)).toBeInTheDocument();
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
  });

  it("shows just now without a for prefix for a new activity", () => {
    const now = Date.UTC(2024, 0, 1, 20, 7, 0);
    vi.useFakeTimers();
    vi.setSystemTime(now);

    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
      if (ref === tripcastApi.travelerState.travelerGetState) {
        return {
          state: {
            energyScore: 60,
            stomachScore: 80,
            stressScore: 20,
            updatedAt: now,
          },
          visibility: null,
        };
      }
      if (ref === tripcastApi.currentActivity.travelerGetCurrentActivity) {
        return {
          _id: "activity-1",
          _creationTime: now,
          status: "active",
          title: "Museum",
          startedAt: now - 20_000,
          createdAt: now - 20_000,
          updatedAt: now - 20_000,
          createdBySessionId: "session-1",
          updatedBySessionId: "session-1",
        };
      }
      if (ref === tripcastApi.travelerAutoState.travelerGetAutoState) {
        return {
          autoStateEnabled: false,
          autoTimeZone: "UTC",
          updatedAt: null,
          updatedBySessionId: null,
        };
      }
      if (ref === tripcastApi.travelerPreferences.travelerGetPreferences) {
        return { updatedAt: null };
      }
      return null;
    });

    render(<StatusCardConnected token="token" role="traveler" onOpenState={vi.fn()} />);

    expect(screen.getByText(/just now/)).toBeInTheDocument();
    expect(screen.queryByText(/for just now/)).not.toBeInTheDocument();
  });

  it("shows the Traveler's saved timezone clock inside the status card", () => {
    const now = Date.UTC(2024, 0, 1, 20, 7, 0);
    vi.useFakeTimers();
    vi.setSystemTime(now);

    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
      if (ref === tripcastApi.travelerState.travelerGetState) {
        return {
          state: {
            energyScore: 60,
            stomachScore: 80,
            stressScore: 20,
            updatedAt: now,
          },
          visibility: null,
        };
      }
      if (ref === tripcastApi.travelerAutoState.travelerGetAutoState) {
        return {
          autoStateEnabled: false,
          autoTimeZone: "Asia/Tokyo",
          updatedAt: now,
          updatedBySessionId: "session-1",
        };
      }
      if (ref === tripcastApi.travelerPreferences.travelerGetPreferences) {
        return {
          travelerTimeZone: "Asia/Tokyo",
          travelerTimeZoneSource: "device",
          travelerTimeZoneUpdatedAt: now,
          updatedAt: now,
        };
      }
      return null;
    });

    render(<StatusCardConnected token="token" role="traveler" onOpenState={vi.fn()} />);

    expect(screen.getByText("5:07 AM")).toBeInTheDocument();
  });

  it("omits the clock when no Traveler timezone has been saved", () => {
    const now = Date.UTC(2024, 0, 1, 20, 7, 0);
    vi.useFakeTimers();
    vi.setSystemTime(now);

    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
      if (ref === tripcastApi.travelerState.travelerGetState) {
        return {
          state: {
            energyScore: 60,
            stomachScore: 80,
            stressScore: 20,
            updatedAt: now,
          },
          visibility: null,
        };
      }
      if (ref === tripcastApi.travelerAutoState.travelerGetAutoState) {
        return {
          autoStateEnabled: false,
          autoTimeZone: "UTC",
          updatedAt: null,
          updatedBySessionId: null,
        };
      }
      if (ref === tripcastApi.travelerPreferences.travelerGetPreferences) {
        return {
          updatedAt: null,
        };
      }
      return null;
    });

    render(<StatusCardConnected token="token" role="traveler" onOpenState={vi.fn()} />);

    expect(screen.queryByText("8:07 PM")).not.toBeInTheDocument();
  });

  it("seeds the Traveler timezone preference from the browser when missing", () => {
    const ensureTimeZone = vi.fn().mockResolvedValue({ updated: true });
    vi.mocked(convexReact.useMutation).mockReturnValue(ensureTimeZone as never);

    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
      if (ref === tripcastApi.travelerState.travelerGetState) {
        return { state: null, visibility: null };
      }
      if (ref === tripcastApi.travelerAutoState.travelerGetAutoState) {
        return {
          autoStateEnabled: false,
          autoTimeZone: "UTC",
          updatedAt: null,
          updatedBySessionId: null,
        };
      }
      if (ref === tripcastApi.travelerPreferences.travelerGetPreferences) {
        return { updatedAt: null };
      }
      return null;
    });

    render(<StatusCardConnected token="token" role="traveler" onOpenState={vi.fn()} />);

    expect(ensureTimeZone).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "token",
        source: "device",
        timeZone: expect.any(String),
      }),
    );
  });
});

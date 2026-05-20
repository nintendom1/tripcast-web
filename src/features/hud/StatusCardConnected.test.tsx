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
    expect(screen.queryByText("Stomach")).not.toBeInTheDocument();
    expect(screen.queryByText("Calm")).not.toBeInTheDocument();
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

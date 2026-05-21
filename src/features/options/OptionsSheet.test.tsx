import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { StoredSession } from "../../lib/auth";
import OptionsSheet from "./OptionsSheet";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("../../components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => (
    open ? <div data-testid="sheet">{children}</div> : null
  ),
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetBody: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  SheetCloseButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>Close</button>
  ),
  SheetGrabber: () => <div />,
  SheetKicker: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetBackButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>Back</button>
  ),
}));

vi.mock("../followers/CreateInviteControl", () => ({
  default: () => <div>Create invite control</div>,
}));

vi.mock("../privacy/EmergencyResetSheet", () => ({
  EmergencyResetContent: () => <div>Emergency reset</div>,
}));

vi.mock("../travelfunds/TravelFundsSheet", () => ({
  default: () => <div>Travel funds</div>,
}));

vi.mock("./BulkImportSheet", () => ({
  default: () => null,
}));

vi.mock("../../debug/DebugPanel", () => ({
  default: () => <div>Debug panel</div>,
}));

const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const fallbackDifferentTimeZone = detectedTimeZone === "UTC" ? "America/Los_Angeles" : "UTC";

const travelerSession: StoredSession = {
  token: "test-token",
  role: "traveler",
  sessionType: "legacy",
  displayName: "Traveler",
};

function setupMocks({
  travelerTimeZone = detectedTimeZone,
  setTimeZoneFn = vi.fn().mockResolvedValue(null),
}: {
  travelerTimeZone?: string | null;
  setTimeZoneFn?: ReturnType<typeof vi.fn>;
} = {}) {
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelerPreferences.travelerGetPreferences) {
      return { travelerTimeZone };
    }
    if (ref === tripcastApi.missionSettings.travelerGetMissionSettings) {
      return {
        moderationMode: "manual_review",
        rateLimitPreset: "per_second",
      };
    }
    return undefined;
  });

  vi.mocked(convexReact.useMutation).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelerPreferences.travelerSetTimeZone) {
      return setTimeZoneFn as any;
    }
    return vi.fn().mockResolvedValue(null) as any;
  });

  return { setTimeZoneFn };
}

function renderOptions(overrides?: Partial<React.ComponentProps<typeof OptionsSheet>>) {
  render(
    <OptionsSheet
      open
      onOpenChange={vi.fn()}
      session={travelerSession}
      role="traveler"
      onSignOut={vi.fn()}
      onManageFollowers={vi.fn()}
      onReplayFollowerTour={vi.fn()}
      onLoggedOut={vi.fn()}
      onLocationDataCleared={vi.fn()}
      onTripDataDeleted={vi.fn()}
      onResetStarted={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OptionsSheet traveler timezone", () => {
  it("shows the traveler timezone in Options with device timezone explanation", () => {
    setupMocks({ travelerTimeZone: "America/Los_Angeles" });

    renderOptions();

    expect(screen.getByText("Traveler Timezone")).toBeInTheDocument();
    expect(screen.getByText("Traveler timezone")).toBeInTheDocument();
    expect(screen.getByText("Based on this device's timezone settings.")).toBeInTheDocument();
    expect(screen.getByText("Saved: America/Los_Angeles")).toBeInTheDocument();
    expect(screen.getByText(`This device: ${detectedTimeZone}`)).toBeInTheDocument();
  });

  it("shows the update button only on mismatch and names the target timezone", async () => {
    const { setTimeZoneFn } = setupMocks({ travelerTimeZone: fallbackDifferentTimeZone });

    renderOptions();

    const button = screen.getByRole("button", { name: `Set timezone to ${detectedTimeZone}` });
    await userEvent.click(button);

    await waitFor(() => {
      expect(setTimeZoneFn).toHaveBeenCalledWith({
        token: "test-token",
        timeZone: detectedTimeZone,
        source: "device",
      });
    });
  });

  it("does not show the update button when the saved timezone matches this device", () => {
    setupMocks({ travelerTimeZone: detectedTimeZone });

    renderOptions();

    expect(screen.queryByRole("button", { name: /set timezone to/i })).not.toBeInTheDocument();
  });
});

describe("OptionsSheet developer scoring toggle", () => {
  const followerSession: StoredSession = {
    token: "follower-token",
    role: "follower",
    sessionType: "follower",
    username: "f1",
    displayName: "Follower",
  };

  it("shows the Traveler-only 'Earn Follower points as Traveler' toggle for the Traveler", () => {
    setupMocks();
    renderOptions();
    expect(screen.getByText("Earn Follower points as Traveler")).toBeInTheDocument();
  });

  it("does not show the developer scoring toggle for a Follower", () => {
    setupMocks();
    renderOptions({ session: followerSession, role: "follower" });
    expect(
      screen.queryByText("Earn Follower points as Traveler"),
    ).not.toBeInTheDocument();
  });
});

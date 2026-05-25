import { render, screen, waitFor, within } from "@testing-library/react";
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

const followerSession: StoredSession = {
  token: "follower-token",
  role: "follower",
  sessionType: "follower",
  username: "f1",
  displayName: "Follower",
};

function setupMocks({
  travelerTimeZone = detectedTimeZone,
  allowFollowersTripPath = false,
  setTimeZoneFn = vi.fn().mockResolvedValue(null),
  updatePreferencesFn = vi.fn().mockResolvedValue(null),
}: {
  travelerTimeZone?: string | null;
  allowFollowersTripPath?: boolean;
  setTimeZoneFn?: ReturnType<typeof vi.fn>;
  updatePreferencesFn?: ReturnType<typeof vi.fn>;
} = {}) {
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelerPreferences.travelerGetPreferences) {
      return { travelerTimeZone, allowFollowersTripPath };
    }
    if (ref === tripcastApi.travelerPreferences.followerGetPreferences) {
      return { visible: true, travelerTimeZone, allowFollowersTripPath };
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
    if ((ref as any) === (tripcastApi.travelerPreferences as any).travelerUpdatePreferences) {
      return updatePreferencesFn as any;
    }
    return vi.fn().mockResolvedValue(null) as any;
  });

  return { setTimeZoneFn, updatePreferencesFn };
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

function optionSectionLabels() {
  return screen.getAllByRole("heading", { level: 3 }).map((heading) =>
    heading.textContent?.trim() ?? "",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
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

describe("OptionsSheet Map Settings", () => {
  it("shows the 'Show Trip Path' toggle for travelers", () => {
    setupMocks();
    renderOptions();
    expect(screen.getByText("Show Trip Path")).toBeInTheDocument();
  });
  it("shows the 'Show Trip Path' toggle for followers", () => {
    setupMocks();
    renderOptions({ session: followerSession, role: "follower" });
    expect(screen.getByText("Show Trip Path")).toBeInTheDocument();
  });

  it("updates localStorage and dispatches event when 'Show Trip Path' is toggled", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    setupMocks();
    renderOptions();

    const checkbox = screen.getByLabelText(/Show Trip Path/i);
    await userEvent.click(checkbox);

    expect(localStorage.getItem("tripcast.showTripPath")).toBe("false");
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
  });

  it("shows 'Followers can see Trip Path' for Traveler", () => {
    setupMocks();
    renderOptions();
    expect(screen.getByText("Followers can see Trip Path")).toBeInTheDocument();
  });
  it("hides 'Followers can see Trip Path' for Follower", () => {
    setupMocks();
    renderOptions({ session: followerSession, role: "follower" });
    expect(screen.queryByText("Followers can see Trip Path")).not.toBeInTheDocument();
  });

  it("calls travelerUpdatePreferences when 'Followers can see Trip Path' is toggled", async () => {
    const { updatePreferencesFn } = setupMocks({ allowFollowersTripPath: false });
    renderOptions();

    const checkbox = screen.getByLabelText(/Followers can see Trip Path/i);
    await userEvent.click(checkbox);

    expect(updatePreferencesFn).toHaveBeenCalledWith({
      token: "test-token",
      allowFollowersTripPath: true,
    });
  });
});

describe("OptionsSheet developer scoring toggle", () => {

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

  it("manually triggers map cooldown from Developer options", async () => {
    localStorage.setItem("tripcast.debug.enabled", "true");
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    setupMocks();
    renderOptions();

    await userEvent.click(screen.getByRole("button", { name: /trigger map cooldown/i }));

    expect(sessionStorage.getItem("tripcast.map_cooldown")).not.toBeNull();
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: "tripcast.mapCooldownChanged",
    }));
    expect(localStorage.getItem("tripcast.debug.logs")).toContain("map:cooldown:manual-trigger");
  });

  it("keeps Developer options at the top for a Traveler", () => {
    setupMocks();
    renderOptions();

    const labels = optionSectionLabels();

    expect(labels.indexOf("Developer")).toBeLessThan(labels.indexOf("Appearance"));
  });

  it("moves Developer options to the bottom for a Follower", () => {
    setupMocks();
    renderOptions({ session: followerSession, role: "follower" });

    const labels = optionSectionLabels();

    expect(labels.at(-1)).toBe("Developer");
    expect(labels.indexOf("Developer")).toBeGreaterThan(labels.indexOf("Trip"));
  });
});

describe("OptionsSheet appearance", () => {
  it("orders theme choices as Auto, Meadow, Constellation", () => {
    setupMocks();
    renderOptions();

    const appearanceSection = screen.getByText("Appearance").closest("section");
    expect(appearanceSection).not.toBeNull();
    const labels = within(appearanceSection!).getAllByRole("button").map((button) =>
      button.textContent?.trim(),
    );

    expect(labels).toEqual(["Auto", "Meadow", "Constellation"]);
  });
});

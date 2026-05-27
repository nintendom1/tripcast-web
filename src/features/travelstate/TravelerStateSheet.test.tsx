import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import { tripcastApi } from "../../convex/tripcastApi";
import TravelerStateSheet from "./TravelerStateSheet";
import { clearLogs, getLogs, setEnabled } from "../../debug/debugLogger";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

// framer-motion's motion.div adds animation state; mock to a plain div for synchronous RTL tests.
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

// Keep mutation mocks keyed by Convex reference so AutoStateTab renders do not
// change callback identities and loop footer-action updates.

function setupMocks({
  state = null,
  visibility = null,
  autoState = null,
  currentActivity = null,
  stalenessSettings = {
    enabled: true,
    fallbackTitle: "Idle",
    fallbackEmoji: "🙂",
    resetAfterMs: 4 * 60 * 60 * 1000,
    updatedAt: null,
    updatedBySessionId: null,
  },
  updateStateFn = vi.fn().mockResolvedValue(null),
  setActivityFn = vi.fn().mockResolvedValue("activity-id"),
  updateStalenessFn = vi.fn().mockResolvedValue(null),
  updateVisibilityFn = vi.fn().mockResolvedValue(null),
  autoMutationFn = vi.fn().mockResolvedValue(null),
}: {
  state?: object | null;
  visibility?: object | null;
  autoState?: object | null;
  currentActivity?: object | null;
  stalenessSettings?: object | null;
  updateStateFn?: ReturnType<typeof vi.fn>;
  setActivityFn?: ReturnType<typeof vi.fn>;
  updateStalenessFn?: ReturnType<typeof vi.fn>;
  updateVisibilityFn?: ReturnType<typeof vi.fn>;
  autoMutationFn?: ReturnType<typeof vi.fn>;
} = {}) {

  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelerState.travelerGetState) {
      return { state, visibility };
    }
    if (ref === tripcastApi.travelerAutoState.travelerGetAutoState) {
      return autoState;
    }
    if (ref === tripcastApi.currentActivity.travelerGetCurrentActivity) {
      return currentActivity;
    }
    if (ref === tripcastApi.currentActivity.travelerGetStalenessSettings) {
      return stalenessSettings;
    }
    return undefined;
  });
  vi.mocked(convexReact.useMutation).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelerState.travelerUpdateState) return updateStateFn as any;
    if (ref === tripcastApi.currentActivity.travelerSetCurrentActivity) return setActivityFn as any;
    if (ref === tripcastApi.currentActivity.travelerUpdateStalenessSettings) return updateStalenessFn as any;
    if (ref === tripcastApi.travelerState.travelerUpdateStateVisibility) return updateVisibilityFn as any;
    return autoMutationFn as any;
  });
  return { updateStateFn, setActivityFn, updateStalenessFn, updateVisibilityFn, autoMutationFn };
}

function renderSheet(overrides?: Partial<React.ComponentProps<typeof TravelerStateSheet>>) {
  const props = {
    token: "test-token",
    onClose: vi.fn(),
    onToast: vi.fn(),
    ...overrides,
  };
  render(<TravelerStateSheet {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  clearLogs();
  setEnabled(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TravelerStateSheet — State tab", () => {
  it("logs sheet open when mounted", async () => {
    setEnabled(true);
    setupMocks();
    renderSheet();

    await waitFor(() => {
      expect(getLogs().some((entry) => entry.src === "TravelerStateSheet" && entry.action === "sheet:open")).toBe(true);
    });
  });

  it("loads current auto-estimated energy and stomach into the state form", () => {
    const now = Date.UTC(2024, 5, 15, 12, 15, 0);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    setupMocks({
      state: {
        energyLevel: "high",
        energyScore: 80,
        stomachLevel: "full",
        stomachScore: 120,
        updatedAt: now - 60_000,
      },
      autoState: {
        autoStateEnabled: true,
        autoEnabledAt: Date.UTC(2024, 5, 15, 12, 0, 0),
        autoTimeZone: "UTC",
        autoBaseEnergyScore: 60,
        autoBaseStomachScore: 80,
        autoBedtimeMinutes: 23 * 60,
        autoWakeTimeMinutes: 9 * 60,
        autoEnergyMin: 0,
        autoEnergyMax: 100,
        autoStomachMin: 0,
        autoStomachMax: 150,
        autoEnergySleepDeltaPerTick: 1,
        autoEnergyAwakeDeltaPerTick: -1,
        autoStomachAwakeDeltaPerTick: -2,
        autoStomachNightAboveHungryEveryTicks: 2,
        autoStomachNightAtOrBelowHungryEveryTicks: 4,
        updatedAt: now,
        updatedBySessionId: null,
      },
    });

    renderSheet();

    const sliders = screen.getAllByRole("slider");
    expect(sliders[0]).toHaveValue("59");
    expect(sliders[1]).toHaveValue("78");
  });

  it("renders mood chips in worst-to-best order", () => {
    setupMocks();
    renderSheet();
    const moodLabels = [
      "Why did I bother", "Disappointed", "Rough", "Anxious", "Melancholy",
      "Okay", "Surprised", "Good", "Hopeful",
    ];
    const chips = moodLabels.map((name) => screen.getByRole("button", { name }));
    expect(chips[0]).toHaveTextContent("Why did I bother");
    expect(chips.at(-1)).toHaveTextContent("Hopeful");
  });

  it("renders schedule chips in worst-to-best order", () => {
    setupMocks();
    renderSheet();
    const scheduleLabels = ["Behind", "Rushed", "Tight", "Comfortable", "Ahead"];
    const chips = scheduleLabels.map((name) => screen.getByRole("button", { name }));
    expect(chips[0]).toHaveTextContent("Behind");
    expect(chips.at(-1)).toHaveTextContent("Ahead");
  });

  it("clicking a mood chip selects it with the active theme token class", async () => {
    setupMocks();
    renderSheet();
    const roughChip = screen.getByRole("button", { name: "Rough" });
    await userEvent.click(roughChip);
    expect(roughChip).toHaveClass("bg-[var(--flag)]");
    expect(roughChip).toHaveClass("text-[var(--ink-on-brand)]");
  });

  it("clicking a selected chip deselects it", async () => {
    setupMocks();
    renderSheet();
    const roughChip = screen.getByRole("button", { name: "Rough" });
    await userEvent.click(roughChip);
    expect(roughChip).toHaveClass("bg-[var(--flag)]");
    await userEvent.click(roughChip);
    expect(roughChip).not.toHaveClass("bg-[var(--flag)]");
  });

  it("Clear All deselects all selected chips", async () => {
    setupMocks();
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Rough" }));
    await userEvent.click(screen.getByRole("button", { name: "Low" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear All" }));
    expect(screen.getByRole("button", { name: "Rough" })).not.toHaveClass("bg-[var(--flag)]");
    expect(screen.getByRole("button", { name: "Low" })).not.toHaveClass("bg-[var(--flag)]");
  });

  it("renders the unified Current Activity fields", () => {
    setupMocks();
    renderSheet();

    expect(screen.getByText("Current Activity")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Walking/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Activity")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Auto-set activity when stale" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Fallback")).toHaveValue("Idle");
    expect(screen.getByLabelText("Fallback Emoji")).toHaveValue("🙂");
    expect(screen.getByLabelText("Hours")).toHaveValue(4);
  });

  it("loads the current activity into the unified status form", () => {
    setupMocks({
      currentActivity: {
        title: "Existing walk",
        emoji: "🚶",
        note: "By the river",
        locationLabel: "Waterfront",
      },
    });

    renderSheet();

    expect(screen.getByLabelText("Activity")).toHaveValue("Existing walk");
    expect(screen.getByLabelText("Emoji")).toHaveValue("🚶");
  });

  it("clicking a quick-activity pill sets the activity title and emoji", async () => {
    setupMocks();
    renderSheet();

    await userEvent.click(screen.getByRole("button", { name: /Walking/ }));

    expect(screen.getByLabelText("Activity")).toHaveValue("Walking");
    expect(screen.getByLabelText("Emoji")).toHaveValue("🚶");
  });

  it("Save Status calls updateState with the correct token and closes the panel", async () => {
    const { updateStateFn, setActivityFn } = setupMocks({ state: null });
    const onClose = vi.fn();
    renderSheet({ onClose });
    await userEvent.click(screen.getByRole("button", { name: "Rough" }));
    await userEvent.click(screen.getByRole("button", { name: "Save Status" }));
    await waitFor(() => {
      expect(updateStateFn).toHaveBeenCalledWith(
        expect.objectContaining({ token: "test-token" }),
      );
    });
    expect(setActivityFn).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("Save Status updates current activity only when the activity changed", async () => {
    const { setActivityFn } = setupMocks({ state: null });
    renderSheet();

    await userEvent.click(screen.getByRole("button", { name: /Walking/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save Status" }));

    await waitFor(() => {
      expect(setActivityFn).toHaveBeenCalledWith({
        token: "test-token",
        title: "Walking",
        emoji: "🚶",
      });
    });
  });

  it("Save Status persists staleness reset changes", async () => {
    const { updateStalenessFn } = setupMocks({ state: null });
    renderSheet();

    await userEvent.clear(screen.getByLabelText("Fallback"));
    await userEvent.type(screen.getByLabelText("Fallback"), "Resting");
    fireEvent.change(screen.getByLabelText("Hours"), { target: { value: "2" } });
    await userEvent.click(screen.getByRole("switch", { name: "Auto-set activity when stale" }));
    await userEvent.click(screen.getByRole("button", { name: "Save Status" }));

    await waitFor(() => {
      expect(updateStalenessFn).toHaveBeenCalledWith({
        token: "test-token",
        enabled: false,
        fallbackTitle: "Resting",
        fallbackEmoji: "🙂",
        resetAfterMs: 2 * 60 * 60 * 1000,
      });
    });
  });

  it("shows a rate-limit error in role=alert when save fails", async () => {
    const updateStateFn = vi.fn().mockRejectedValue(new Error("rate limit exceeded"));
    setupMocks({ state: null, updateStateFn });
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Save Status" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Too many updates");
    });
  });

  it("shows a traveler-access error in role=alert when save fails with auth error", async () => {
    const updateStateFn = vi.fn().mockRejectedValue(new Error("traveler role required"));
    setupMocks({ state: null, updateStateFn });
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Save Status" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Traveler access is required");
    });
  });
});

describe("TravelerStateSheet — segmented redesign", () => {
  it("keeps the save footer outside the scrollable body", () => {
    setupMocks();
    renderSheet();

    const body = document.querySelector("[data-role='traveler-state-sheet-body']");
    const footer = document.querySelector("[data-role='traveler-state-sheet-footer']");
    const sheet = document.querySelector("[data-role='traveler-state-sheet']");

    expect(sheet).toHaveClass("z-[10]");
    expect(sheet).toHaveClass("bottom-0");
    expect(sheet).toHaveClass("max-h-[85dvh]");
    expect(body).toHaveClass("overflow-y-auto");
    expect(body).toHaveClass("pb-28");
    expect(footer).toHaveClass("flex-none");
    expect(footer).toHaveClass("pb-[calc(var(--dock-h,76px)+16px+env(safe-area-inset-bottom))]");
    expect(footer).toContainElement(screen.getByRole("button", { name: "Save Status" }));
  });

  it("leads with the Energy/Stomach/Calm bars segment", () => {
    setupMocks();
    renderSheet();
    expect(screen.getByText("Energy · Stomach · Calm")).toBeInTheDocument();
    // The stress axis is presented as "Calm" on the state form (section label
    // plus the lowest-stress chip both read "Calm").
    expect(screen.getAllByText("Calm").length).toBeGreaterThan(0);
  });

  it("logs a segment change when a bar slider moves", async () => {
    setEnabled(true);
    setupMocks();
    renderSheet();
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0], { target: { value: "42" } });
    await waitFor(() => {
      expect(
        getLogs().some(
          (entry) => entry.src === "TravelerStateSheet" && entry.action === "state:segment:change",
        ),
      ).toBe(true);
    });
  });

  it("logs rendered dimensions on mount", async () => {
    setEnabled(true);
    setupMocks();
    renderSheet();
    await waitFor(() => {
      expect(
        getLogs().some(
          (entry) => entry.src === "TravelerStateSheet" && entry.action === "state:rendered",
        ),
      ).toBe(true);
    });
  });
});

describe("TravelerStateSheet — Visibility tab", () => {
  it("switches to visibility tab and shows toggle rows", async () => {
    setupMocks();
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Visibility" }));
    expect(screen.getByText("Show Traveler State")).toBeInTheDocument();
    expect(screen.getByText("Mood")).toBeInTheDocument();
    expect(screen.getByText("Clock")).toBeInTheDocument();
    expect(screen.getByText("Biometrics")).toBeInTheDocument();
  });

  it("renders Save Visibility in the pinned footer", async () => {
    setupMocks();
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Visibility" }));

    const footer = document.querySelector("[data-role='traveler-state-sheet-footer']");
    expect(footer).toContainElement(screen.getByRole("button", { name: "Save Visibility" }));
  });

  it("Save Visibility calls updateVisibility with token, fires onToast, and closes", async () => {
    const { updateVisibilityFn } = setupMocks();
    const onClose = vi.fn();
    const onToast = vi.fn();
    renderSheet({ onClose, onToast });
    await userEvent.click(screen.getByRole("button", { name: "Visibility" }));
    await userEvent.click(screen.getByRole("button", { name: "Save Visibility" }));
    await waitFor(() => {
      expect(updateVisibilityFn).toHaveBeenCalledWith(
        expect.objectContaining({ token: "test-token", showTravelerClock: true }),
      );
    });
    expect(onToast).toHaveBeenCalledWith("Visibility saved.");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows error in role=alert when visibility save fails", async () => {
    const updateVisibilityFn = vi.fn().mockRejectedValue(new Error("traveler role required"));
    setupMocks({ updateVisibilityFn });
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Visibility" }));
    await userEvent.click(screen.getByRole("button", { name: "Save Visibility" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Traveler access is required");
    });
  });

  it("saves Clock visibility when toggled off", async () => {
    const { updateVisibilityFn } = setupMocks();
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Visibility" }));
    await userEvent.click(screen.getByRole("switch", { name: "Clock" }));
    await userEvent.click(screen.getByRole("button", { name: "Save Visibility" }));
    await waitFor(() => {
      expect(updateVisibilityFn).toHaveBeenCalledWith(
        expect.objectContaining({ showTravelerClock: false }),
      );
    });
  });

});

describe("TravelerStateSheet — Auto State tab", () => {
  it("renders Save Auto settings in the pinned footer", async () => {
    setupMocks();
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Auto State" }));

    const footer = document.querySelector("[data-role='traveler-state-sheet-footer']");
    expect(footer).toContainElement(screen.getByRole("button", { name: "Save Auto settings" }));
  });
});

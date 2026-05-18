import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import { tripcastApi } from "../../convex/tripcastApi";
import TravelerStateSheet from "./TravelerStateSheet";

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

// Mutation order inside TravelerStateSheet:
//   1st useMutation call → travelerUpdateState
//   2nd useMutation call → travelerUpdateStateVisibility

function setupMocks({
  state = null,
  visibility = null,
  updateStateFn = vi.fn().mockResolvedValue(null),
  updateVisibilityFn = vi.fn().mockResolvedValue(null),
}: {
  state?: object | null;
  visibility?: object | null;
  updateStateFn?: ReturnType<typeof vi.fn>;
  updateVisibilityFn?: ReturnType<typeof vi.fn>;
} = {}) {

  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelerState.travelerGetState) {
      return { state, visibility };
    }
    return undefined;
  });
  const mutationFns = [updateStateFn, updateVisibilityFn];
  let callCount = 0;

  vi.mocked(convexReact.useMutation).mockImplementation(() => mutationFns[callCount++ % 2] as any);
  return { updateStateFn, updateVisibilityFn };
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
});

describe("TravelerStateSheet — State tab", () => {
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

  it("clicking a mood chip selects it (adds bg-navy class)", async () => {
    setupMocks();
    renderSheet();
    const roughChip = screen.getByRole("button", { name: "Rough" });
    await userEvent.click(roughChip);
    expect(roughChip).toHaveClass("bg-navy");
  });

  it("clicking a selected chip deselects it", async () => {
    setupMocks();
    renderSheet();
    const roughChip = screen.getByRole("button", { name: "Rough" });
    await userEvent.click(roughChip);
    expect(roughChip).toHaveClass("bg-navy");
    await userEvent.click(roughChip);
    expect(roughChip).not.toHaveClass("bg-navy");
  });

  it("Clear All deselects all selected chips", async () => {
    setupMocks();
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Rough" }));
    await userEvent.click(screen.getByRole("button", { name: "Low" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear All" }));
    expect(screen.getByRole("button", { name: "Rough" })).not.toHaveClass("bg-navy");
    expect(screen.getByRole("button", { name: "Low" })).not.toHaveClass("bg-navy");
  });

  it("Save State shows review panel with 'No previous entry' when state is null", async () => {
    setupMocks({ state: null });
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Rough" }));
    await userEvent.click(screen.getByRole("button", { name: "Save State" }));
    expect(screen.getByText("No previous entry")).toBeInTheDocument();
  });

  it("Save State shows 'No changes from last entry.' when form matches saved state", async () => {
    setupMocks({
      state: { moodValue: "rough", updatedAt: Date.now() - 60_000 },
    });
    renderSheet();
    // Form populates from state via useEffect; no additional clicks needed
    await userEvent.click(screen.getByRole("button", { name: "Save State" }));
    expect(screen.getByText("No changes from last entry.")).toBeInTheDocument();
  });

  it("Save State shows diff row when mood changes from saved state", async () => {
    setupMocks({
      state: { moodValue: "okay", updatedAt: Date.now() - 60_000 },
    });
    renderSheet();
    // Form populates with "okay"; deselect it and pick "rough"
    await userEvent.click(screen.getByRole("button", { name: "Okay" }));
    await userEvent.click(screen.getByRole("button", { name: "Rough" }));
    await userEvent.click(screen.getByRole("button", { name: "Save State" }));
    expect(screen.getByText("Mood")).toBeInTheDocument();
    expect(screen.getByText("Okay")).toBeInTheDocument();
    expect(screen.getByText("Rough")).toBeInTheDocument();
  });

  it("Back button returns from review panel to edit form", async () => {
    setupMocks({ state: null });
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Rough" }));
    await userEvent.click(screen.getByRole("button", { name: "Save State" }));
    expect(screen.getByText("No previous entry")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Save State" })).toBeInTheDocument();
  });

  it("Confirm calls updateState with the correct token and closes the panel", async () => {
    const { updateStateFn } = setupMocks({ state: null });
    const onClose = vi.fn();
    renderSheet({ onClose });
    await userEvent.click(screen.getByRole("button", { name: "Rough" }));
    await userEvent.click(screen.getByRole("button", { name: "Save State" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(updateStateFn).toHaveBeenCalledWith(
        expect.objectContaining({ token: "test-token" }),
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a rate-limit error in role=alert when save fails", async () => {
    const updateStateFn = vi.fn().mockRejectedValue(new Error("rate limit exceeded"));
    setupMocks({ state: null, updateStateFn });
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Save State" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Too many updates");
    });
  });

  it("shows a traveler-access error in role=alert when save fails with auth error", async () => {
    const updateStateFn = vi.fn().mockRejectedValue(new Error("traveler role required"));
    setupMocks({ state: null, updateStateFn });
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Save State" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Traveler access is required");
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
    expect(screen.getByText("Biometrics")).toBeInTheDocument();
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
        expect.objectContaining({ token: "test-token" }),
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
});

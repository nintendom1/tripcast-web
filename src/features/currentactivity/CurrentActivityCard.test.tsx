import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import { tripcastApi } from "../../convex/tripcastApi";
import type { CurrentActivity } from "../../convex/tripcastApi";
import CurrentActivityCard from "./CurrentActivityCard";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_ACTIVITY: CurrentActivity = {
  _id: "act1",
  _creationTime: Date.now() - 600_000,
  title: "Walking",
  emoji: "🚶",
  note: "test note",
  startedAt: Date.now() - 600_000,
  status: "active",
  createdAt: Date.now() - 600_000,
  updatedAt: Date.now() - 600_000,
};

function makeProps(overrides?: Partial<Parameters<typeof CurrentActivityCard>[0]>) {
  return {
    token: "test-token",
    role: "traveler" as const,
    onCompleteAsCheckIn: vi.fn(),
    onRequestSetActivity: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * For traveler role:
 *   useQuery (travelerGetCurrentActivity) → activityResult
 * useMutation → dropMutation fn
 */
function setupTravelerMocks(activityResult: CurrentActivity | null | undefined) {
  const dropMock = vi.fn().mockResolvedValue(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.currentActivity.travelerGetCurrentActivity) return activityResult;
    return undefined;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(convexReact.useMutation).mockReturnValue(dropMock as any);
  return { dropMock };
}

/**
 * For support_crew role:
 *   1st useQuery call (supportCrewGetCurrentActivity) → activityResult
 */
function setupSupportCrewMocks(activityResult: CurrentActivity | null | undefined) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.currentActivity.supportCrewGetCurrentActivity) return activityResult;
    return undefined;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn() as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Traveler view
// ---------------------------------------------------------------------------

describe("CurrentActivityCard — traveler role", () => {
  it("renders nothing when useQuery returns undefined (loading)", () => {
    setupTravelerMocks(undefined);
    const { container } = render(<CurrentActivityCard {...makeProps()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders 'Nothing active' and 'Set Activity' button when no active activity", () => {
    setupTravelerMocks(null);
    render(<CurrentActivityCard {...makeProps()} />);
    expect(screen.getByText("Nothing active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set Activity" })).toBeInTheDocument();
  });

  it("renders activity title and emoji when active", () => {
    setupTravelerMocks(BASE_ACTIVITY);
    render(<CurrentActivityCard {...makeProps()} />);
    expect(screen.getByText("Walking")).toBeInTheDocument();
    expect(screen.getByText("🚶")).toBeInTheDocument();
  });

  it("renders note truncated at 60 chars when active", () => {
    const longNote = "A".repeat(70);
    const activity: CurrentActivity = { ...BASE_ACTIVITY, note: longNote };
    setupTravelerMocks(activity);
    render(<CurrentActivityCard {...makeProps()} />);
    const truncated = "A".repeat(60) + "…";
    expect(screen.getByText(truncated)).toBeInTheDocument();
  });

  it("renders full note when note is ≤ 60 chars", () => {
    const shortNote = "Short note here";
    const activity: CurrentActivity = { ...BASE_ACTIVITY, note: shortNote };
    setupTravelerMocks(activity);
    render(<CurrentActivityCard {...makeProps()} />);
    expect(screen.getByText("Short note here")).toBeInTheDocument();
  });

  it("renders 'Complete as Check-in' button when active", () => {
    setupTravelerMocks(BASE_ACTIVITY);
    render(<CurrentActivityCard {...makeProps()} />);
    expect(screen.getByRole("button", { name: "Complete as Check-in" })).toBeInTheDocument();
  });

  it("calls onCompleteAsCheckIn with the activity when 'Complete as Check-in' is clicked", async () => {
    setupTravelerMocks(BASE_ACTIVITY);
    const onCompleteAsCheckIn = vi.fn();
    render(<CurrentActivityCard {...makeProps({ onCompleteAsCheckIn })} />);
    await userEvent.click(screen.getByRole("button", { name: "Complete as Check-in" }));
    expect(onCompleteAsCheckIn).toHaveBeenCalledWith(BASE_ACTIVITY);
  });

  it("calls onRequestSetActivity when 'Change' button is clicked", async () => {
    setupTravelerMocks(BASE_ACTIVITY);
    const onRequestSetActivity = vi.fn();
    render(<CurrentActivityCard {...makeProps({ onRequestSetActivity })} />);
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(onRequestSetActivity).toHaveBeenCalled();
  });

  it("renders 'Drop' button when active", () => {
    setupTravelerMocks(BASE_ACTIVITY);
    render(<CurrentActivityCard {...makeProps()} />);
    expect(screen.getByRole("button", { name: "Drop" })).toBeInTheDocument();
  });

  it("calls drop mutation when 'Drop' button is clicked", async () => {
    const { dropMock } = setupTravelerMocks(BASE_ACTIVITY);
    render(<CurrentActivityCard {...makeProps()} />);
    await userEvent.click(screen.getByRole("button", { name: "Drop" }));
    await waitFor(() => {
      expect(dropMock).toHaveBeenCalledWith({ token: "test-token", activityId: "act1" });
    });
  });
});

// ---------------------------------------------------------------------------
// Support crew view
// ---------------------------------------------------------------------------

describe("CurrentActivityCard — support_crew role", () => {
  it("renders nothing when activity is null (no active activity)", () => {
    setupSupportCrewMocks(null);
    const { container } = render(<CurrentActivityCard {...makeProps({ role: "support_crew" })} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when useQuery returns undefined (loading)", () => {
    setupSupportCrewMocks(undefined);
    const { container } = render(<CurrentActivityCard {...makeProps({ role: "support_crew" })} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders activity title and emoji when active", () => {
    setupSupportCrewMocks(BASE_ACTIVITY);
    render(<CurrentActivityCard {...makeProps({ role: "support_crew" })} />);
    expect(screen.getByText("Walking")).toBeInTheDocument();
    expect(screen.getByText("🚶")).toBeInTheDocument();
  });

  it("does not render action buttons for support crew", () => {
    setupSupportCrewMocks(BASE_ACTIVITY);
    render(<CurrentActivityCard {...makeProps({ role: "support_crew" })} />);
    expect(screen.queryByRole("button", { name: "Complete as Check-in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Drop" })).not.toBeInTheDocument();
  });
});

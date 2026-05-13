import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import { tripcastApi } from "../../convex/tripcastApi";
import TravelerStateCard from "./TravelerStateCard";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const BASE_CREW_STATE = {
  visible: true as const,
  updatedAt: Date.now() - 120_000,
  moodValue: "good" as const,
  energyLevel: "medium" as const,
  energyScore: 50,
  stomachLevel: "satisfied" as const,
  stomachScore: 80,
  stressLevel: "calm" as const,
  stressScore: 12,
  schedulePressureLevel: "comfortable" as const,
  statusNote: "Feeling great!",
};

const BASE_TRAVELER_STATE = {
  moodValue: "good" as const,
  energyLevel: "medium" as const,
  energyScore: 50,
  stomachLevel: "satisfied" as const,
  stomachScore: 80,
  stressLevel: "calm" as const,
  stressScore: 12,
  schedulePressureLevel: "comfortable" as const,
  statusNote: "Feeling great!",
  updatedAt: Date.now() - 120_000,
};

function setupCrewQuery(data: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelerState.supportCrewGetTravelerState) return data;
    return undefined;
  });
  // SupportCrewCard has no mutations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn() as any);
}

function setupTravelerQuery(state: object | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelerState.travelerGetState) {
      return { state, visibility: null };
    }
    return undefined;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn().mockResolvedValue(null) as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Support Crew card
// ---------------------------------------------------------------------------

describe("TravelerStateCard — support_crew role", () => {
  it("renders nothing when data is undefined (loading)", () => {
    setupCrewQuery(undefined);
    const { container } = render(<TravelerStateCard token="t" role="support_crew" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when visible is false", () => {
    setupCrewQuery({ visible: false, updatedAt: null });
    const { container } = render(<TravelerStateCard token="t" role="support_crew" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when updatedAt is null", () => {
    setupCrewQuery({ visible: true, updatedAt: null });
    const { container } = render(<TravelerStateCard token="t" role="support_crew" />);
    expect(container.firstChild).toBeNull();
  });

  it("shows mood label as a chip badge", () => {
    setupCrewQuery(BASE_CREW_STATE);
    render(<TravelerStateCard token="t" role="support_crew" />);
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("shows energy label", () => {
    setupCrewQuery(BASE_CREW_STATE);
    render(<TravelerStateCard token="t" role="support_crew" />);
    expect(screen.getByText("Medium")).toBeInTheDocument();
  });

  it("shows status note in quotes", () => {
    setupCrewQuery(BASE_CREW_STATE);
    render(<TravelerStateCard token="t" role="support_crew" />);
    expect(screen.getByText(/Feeling great!/)).toBeInTheDocument();
  });

  it("collapses body when the toggle button is clicked", async () => {
    setupCrewQuery(BASE_CREW_STATE);
    render(<TravelerStateCard token="t" role="support_crew" />);
    // Body is initially expanded — mood chip should be visible
    expect(screen.getByText("Good")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Collapse" }));
    // After collapse, stat rows are gone
    expect(screen.queryByText("Good")).not.toBeInTheDocument();
  });

  it("re-expands body after collapse", async () => {
    setupCrewQuery(BASE_CREW_STATE);
    render(<TravelerStateCard token="t" role="support_crew" />);
    await userEvent.click(screen.getByRole("button", { name: "Collapse" }));
    await userEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("Good")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Traveler card
// ---------------------------------------------------------------------------

describe("TravelerStateCard — traveler role", () => {
  it("renders nothing when data is undefined (loading)", () => {
    setupTravelerQuery(null);
    const { container } = render(<TravelerStateCard token="t" role="traveler" />);
    // travelerGetState returns { state: null } → null render
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when useQuery returns undefined", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vi.mocked(convexReact.useQuery) as any).mockReturnValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn() as any);
    const { container } = render(<TravelerStateCard token="t" role="traveler" />);
    expect(container.firstChild).toBeNull();
  });

  it("shows mood label as a chip badge", () => {
    setupTravelerQuery(BASE_TRAVELER_STATE);
    render(<TravelerStateCard token="t" role="traveler" />);
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("shows energy label", () => {
    setupTravelerQuery(BASE_TRAVELER_STATE);
    render(<TravelerStateCard token="t" role="traveler" />);
    expect(screen.getByText("Medium")).toBeInTheDocument();
  });

  it("shows status note in quotes", () => {
    setupTravelerQuery(BASE_TRAVELER_STATE);
    render(<TravelerStateCard token="t" role="traveler" />);
    expect(screen.getByText(/Feeling great!/)).toBeInTheDocument();
  });

  it("collapses body when the toggle button is clicked", async () => {
    setupTravelerQuery(BASE_TRAVELER_STATE);
    render(<TravelerStateCard token="t" role="traveler" />);
    expect(screen.getByText("Good")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.queryByText("Good")).not.toBeInTheDocument();
  });
});

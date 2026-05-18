import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import * as authLib from "./lib/auth";
import App from "./App";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
  ConvexProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./lib/auth", () => ({
  getStoredSession: vi.fn(),
  clearStoredSession: vi.fn(),
  setStoredSession: vi.fn(),
}));

vi.mock("./features/map/TripMap", () => ({
  default: () => <div data-testid="trip-map" />,
}));

vi.mock("./features/followers/FollowerManagementPanel", () => ({
  default: () => <div data-testid="follower-panel" />,
}));

function setupSessionMocks(role: "traveler" | "support_crew") {
  vi.mocked(authLib.getStoredSession).mockReturnValue({
    token: "test-token",
    role,
    sessionType: "legacy" as const,
  });
  vi.mocked(convexReact.useQuery).mockReturnValue({ role });
   
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn() as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("App: Options button", () => {
  it("shows Options button in the header", () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    expect(screen.getByRole("button", { name: /options/i })).toBeInTheDocument();
  });

  it("does not show Emergency Reset button in the header", () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    expect(
      screen.queryByRole("button", { name: /emergency reset/i }),
    ).not.toBeInTheDocument();
  });

  it("does not show Sign out button in the header", () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });
});

describe("App: Options sheet — Traveler", () => {
  it("opens the Options sheet when the Options button is clicked", async () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Options" })).toBeInTheDocument();
  });

  it("shows Sign out in Options for traveler", async () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("shows Emergency Reset in Options Danger Zone for traveler", async () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(screen.getByRole("button", { name: /emergency reset/i })).toBeInTheDocument();
    expect(screen.getByText(/danger zone/i)).toBeInTheDocument();
  });

  it("shows Followers section in Options for traveler", async () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(screen.getByRole("heading", { name: /followers/i })).toBeInTheDocument();
  });

  it("shows Bulk Import in the traveler Data / Dev section", async () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(screen.getByRole("heading", { name: /data \/ dev/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bulk import/i })).toBeInTheDocument();
  });

  it("orders reading speed controls slow to instant and leaves Danger Zone last", async () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));

    const buttons = ["slow", "normal", "fast", "instant"].map((name) =>
      screen.getByRole("button", { name }),
    );
    expect(buttons.map((button) => button.textContent)).toEqual(["slow", "normal", "fast", "instant"]);

    const tour = screen.getByRole("heading", { name: /tour/i });
    const dangerZone = screen.getByRole("heading", { name: /danger zone/i });
    expect(
      tour.compareDocumentPosition(dangerZone) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("replays the welcome tour from Options", async () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    await userEvent.click(screen.getByRole("button", { name: /replay welcome tour/i }));
    expect(screen.getByRole("button", { name: /^skip$/i })).toBeInTheDocument();
  });
});

describe("App: Options sheet — Support Crew", () => {
  it("opens the Options sheet for support crew", async () => {
    setupSessionMocks("support_crew");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not show Emergency Reset in Options for support crew", async () => {
    setupSessionMocks("support_crew");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(
      screen.queryByRole("button", { name: /emergency reset/i }),
    ).not.toBeInTheDocument();
  });

  it("does not show Followers section in Options for support crew", async () => {
    setupSessionMocks("support_crew");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(screen.queryByText(/danger zone/i)).not.toBeInTheDocument();
  });

  it("does not show traveler-only Bulk Import for support crew", async () => {
    setupSessionMocks("support_crew");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(screen.queryByRole("button", { name: /bulk import/i })).not.toBeInTheDocument();
  });

  it("shows Sign out in Options for support crew", async () => {
    setupSessionMocks("support_crew");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });
});

describe("App: Sign out from Options", () => {
  it("clears the session and returns to login when Sign out is clicked from Options", async () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(vi.mocked(authLib.clearStoredSession)).toHaveBeenCalled();
  });
});

describe("App: Manage Followers navigation", () => {
  it("Manage Followers button is present in Options for traveler", async () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(screen.getByRole("button", { name: /manage followers/i })).toBeInTheDocument();
  });

  it("clicking Manage Followers closes options and shows follower management page", async () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    await userEvent.click(screen.getByRole("button", { name: /manage followers/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /manage followers/i })).toBeInTheDocument();
  });

  it("Manage Followers button is not present in Options for support crew", async () => {
    setupSessionMocks("support_crew");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(screen.queryByRole("button", { name: /manage followers/i })).not.toBeInTheDocument();
  });
});

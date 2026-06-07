import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import * as authLib from "./lib/auth";
import App from "./App";
import { clearLogs, log, setEnabled, setPreset } from "./debug/debugLogger";

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

function setupSessionMocks(role: "traveler" | "follower") {
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
  localStorage.clear();
  clearLogs();
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

  it("shows the Follower content cutoff entry in Options for traveler", async () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    // Renders as a navigation row right above the Danger Zone (see OptionsHome).
    expect(
      screen.getByRole("button", { name: /follower content cutoff/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /privacy/i })).toBeInTheDocument();
  });

  it("shows Bulk Import and Bulk Export in the traveler Data / Dev section", async () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(screen.getByRole("heading", { name: /data \/ dev/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^bulk import\b/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^bulk export\b/i })).toBeInTheDocument();
  });

  it("orders reading speed controls slow to instant and leaves Danger Zone last", async () => {
    setupSessionMocks("traveler");
    localStorage.setItem("tripcast.debug.enabled", "true");
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

  it("keeps Debug Log fixed size while log entries scroll", async () => {
    setupSessionMocks("traveler");
    setEnabled(true);
    setPreset("interaction-trace");
    log("info", "Test", "trace:row", "interaction");

    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    await userEvent.click(screen.getByRole("button", { name: /debug log/i }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("h-[88dvh]", "overflow-hidden");

    const logList = screen.getByLabelText(/recent debug log entries/i);
    expect(logList.parentElement).toHaveClass("h-[18rem]", "shrink-0", "overflow-y-auto");
    expect(screen.getByRole("button", { name: /copy debug summary/i })).toBeInTheDocument();
  });
});

describe("App: Options sheet — Follower", () => {
  it("opens the Options sheet for support follower", async () => {
    setupSessionMocks("follower");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not show Emergency Reset in Options for support follower", async () => {
    setupSessionMocks("follower");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(
      screen.queryByRole("button", { name: /emergency reset/i }),
    ).not.toBeInTheDocument();
  });

  it("does not show Followers section in Options for support follower", async () => {
    setupSessionMocks("follower");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(screen.queryByText(/danger zone/i)).not.toBeInTheDocument();
  });

  it("does not show traveler-only Bulk Import for support follower", async () => {
    setupSessionMocks("follower");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(screen.queryByRole("button", { name: /bulk import/i })).not.toBeInTheDocument();
  });

  it("shows Sign out in Options for support follower", async () => {
    setupSessionMocks("follower");
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

  it("returns to the landing page with the login modal closed after signing in and out", async () => {
    vi.mocked(authLib.getStoredSession).mockReturnValue(null);
    vi.mocked(convexReact.useQuery).mockImplementation((_query, args?) => (
      args === "skip" ? undefined : { role: "follower" }
    ) as any);
    vi.mocked(convexReact.useMutation).mockReturnValue(
      vi.fn(async (args: any) => (args?.username ? { token: "follower-token" } : undefined)) as any,
    );

    render(<App convexReady={true} />);

    await userEvent.click(screen.getByRole("button", { name: /^login$/i }));
    await userEvent.type(screen.getByLabelText(/^username$/i), "alice");
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /options/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(await screen.findByRole("heading", { level: 1, name: /follow the traveler/i })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /follower sign in/i })).not.toBeInTheDocument();
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

  it("Manage Followers button is not present in Options for support follower", async () => {
    setupSessionMocks("follower");
    render(<App convexReady={true} />);
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(screen.queryByRole("button", { name: /manage followers/i })).not.toBeInTheDocument();
  });
});

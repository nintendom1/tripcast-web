import { render, screen, waitFor } from "@testing-library/react";
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

// TripMap is lazy-loaded; mock it to avoid MapLibre GL dependency in jsdom.
vi.mock("./features/map/TripMap", () => ({
  default: () => <div data-testid="trip-map" />,
}));

function setupSessionMocks(role: "traveler" | "support_crew") {
  vi.mocked(authLib.getStoredSession).mockReturnValue({
    token: "test-token",
    role,
    sessionType: "legacy" as const,
  });
  // currentSession query returns the role; all mutations return no-ops.
  vi.mocked(convexReact.useQuery).mockReturnValue({ role });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn() as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("App: Options button and Emergency Reset location", () => {
  it("shows the Options button in the header for a traveler session", () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    expect(screen.getByRole("button", { name: /options/i })).toBeInTheDocument();
  });

  it("does not show Emergency Reset in the header for a traveler session", () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    expect(
      screen.queryByRole("button", { name: /emergency reset/i }),
    ).not.toBeInTheDocument();
  });

  it("returns to the map and shows a toast after confirming shared data deletion via Options", async () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);

    // Open Options sheet
    await userEvent.click(screen.getByRole("button", { name: /options/i }));
    // Click Emergency Reset in Danger Zone
    await userEvent.click(screen.getByRole("button", { name: /emergency reset/i }));
    // Now in Emergency Reset content within the same sheet root.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Options" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Emergency Reset" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete Shared Trip Data" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm shared data deletion" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("trip-map")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Shared trip data deletion started.");
  });
});

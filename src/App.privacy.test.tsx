import { render, screen } from "@testing-library/react";
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
  });
  // currentSession query returns the role; signOut mutation returns a no-op.
  vi.mocked(convexReact.useQuery).mockReturnValue({ role });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn() as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("App: Emergency Reset button visibility", () => {
  it("shows the Emergency Reset button for a traveler session", () => {
    setupSessionMocks("traveler");
    render(<App convexReady={true} />);
    expect(screen.getByRole("button", { name: /emergency reset/i })).toBeInTheDocument();
  });

  it("does not show the Emergency Reset button for a support crew session", () => {
    setupSessionMocks("support_crew");
    render(<App convexReady={true} />);
    expect(screen.queryByRole("button", { name: /emergency reset/i })).not.toBeInTheDocument();
  });
});

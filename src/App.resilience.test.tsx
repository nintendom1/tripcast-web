import { act, fireEvent, render, screen } from "@testing-library/react";
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

function setOnlineStatus(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  setOnlineStatus(true);
  vi.mocked(authLib.getStoredSession).mockReturnValue({
    token: "test-token",
    role: "traveler",
    sessionType: "legacy",
  });
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn().mockResolvedValue(null) as any);  
});

describe("App resilience", () => {
  it("shows a root recovery view when a render-time query error is thrown", () => {
    vi.mocked(convexReact.useQuery).mockImplementation(() => {
      throw new Error("query exploded");
    });

    render(<App convexReady={true} />);

    expect(screen.getByRole("alert")).toHaveTextContent("TripCast hit a problem.");
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload app/i })).toBeInTheDocument();
  });

  it("shows delayed connection recovery while stored session verification stays pending", async () => {
    vi.useFakeTimers();
    vi.mocked(convexReact.useQuery).mockReturnValue(undefined);

    render(<App convexReady={true} />);

    expect(screen.getByText("Verifying session...")).toBeInTheDocument();
    expect(vi.mocked(authLib.clearStoredSession)).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText(/still waiting for the service/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    expect(vi.mocked(authLib.clearStoredSession)).not.toHaveBeenCalled();
  });

  it("uses passive offline state in delayed session recovery copy", async () => {
    vi.useFakeTimers();
    setOnlineStatus(false);
    vi.mocked(convexReact.useQuery).mockReturnValue(undefined);

    render(<App convexReady={true} />);

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getAllByText(/browser appears to be offline/i).length).toBeGreaterThan(0);
  });

  it("signs out from delayed session recovery without treating pending verification as invalid", async () => {
    vi.useFakeTimers();
    vi.mocked(convexReact.useQuery).mockReturnValue(undefined);
    const signOut = vi.fn(() => new Promise(() => {}));
    vi.mocked(convexReact.useMutation).mockReturnValue(signOut as any);  
    render(<App convexReady={true} />);

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    });

    expect(vi.mocked(authLib.clearStoredSession)).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ token: "test-token" });
  });
});

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

vi.mock("./features/map/TripMap", () => ({
  default: () => {
    throw new Error("map exploded");
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authLib.getStoredSession).mockReturnValue({
    token: "test-token",
    role: "traveler",
    sessionType: "legacy",
  });
  vi.mocked(convexReact.useQuery).mockReturnValue({ role: "traveler" });
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn() as any); // eslint-disable-line @typescript-eslint/no-explicit-any
});

describe("App map boundary", () => {
  it("shows map recovery UI when the lazy map subtree fails", async () => {
    render(<App convexReady={true} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("The map could not load.");
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload app/i })).toBeInTheDocument();
  });
});

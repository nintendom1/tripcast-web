import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import FollowerManagementPage from "./FollowerManagementPage";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("./FollowerManagementPanel", () => ({
  default: () => <div data-testid="follower-panel" />,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(convexReact.useQuery).mockReturnValue([] as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn().mockResolvedValue(null) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
});

describe("FollowerManagementPage", () => {
  it("renders Manage Followers heading", () => {
    render(<FollowerManagementPage token="test-token" onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /manage followers/i })).toBeInTheDocument();
  });

  it("renders a Back button", () => {
    render(<FollowerManagementPage token="test-token" onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  it("clicking Back calls onBack", async () => {
    const onBack = vi.fn();
    render(<FollowerManagementPage token="test-token" onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("renders the follower panel", () => {
    render(<FollowerManagementPage token="test-token" onBack={vi.fn()} />);
    expect(screen.getByTestId("follower-panel")).toBeInTheDocument();
  });
});

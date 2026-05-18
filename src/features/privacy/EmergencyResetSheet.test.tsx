import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import EmergencyResetSheet from "./EmergencyResetSheet";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

// The Sheet component from shadcn uses Radix UI Portal which appends outside
// the render container. Querying the full document body works correctly.

function makeProps(overrides?: Partial<Parameters<typeof EmergencyResetSheet>[0]>) {
  return {
    open: true,
    token: "test-token",
    onOpenChange: vi.fn(),
    onLoggedOut: vi.fn(),
    onLocationDataCleared: vi.fn(),
    onTripDataDeleted: vi.fn(),
    onResetStarted: vi.fn(),
    ...overrides,
  };
}

function setupMutationMocks() {
  const mocks = {
    emergencyReset: vi.fn().mockResolvedValue(null),
  };

  vi.mocked(convexReact.useMutation).mockReturnValue(mocks.emergencyReset as any);
  return mocks;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EmergencyResetSheet", () => {
  it("shows one grouped reset action and the log everyone off checkbox when open", () => {
    setupMutationMocks();
    render(<EmergencyResetSheet {...makeProps()} />);

    expect(screen.getByRole("heading", { name: "Delete Shared Trip Data" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /log everyone off too/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Shared Trip Data" })).toBeInTheDocument();
  });

  it("shows the confirmation dialog after clicking emergency reset", async () => {
    setupMutationMocks();
    render(<EmergencyResetSheet {...makeProps()} />);

    await userEvent.click(screen.getByRole("button", { name: "Delete Shared Trip Data" }));

    expect(screen.getByRole("button", { name: "Confirm shared data deletion" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls emergencyReset once and triggers trip reset callbacks on confirm", async () => {
    const mocks = setupMutationMocks();
    const onTripDataDeleted = vi.fn();
    const onLocationDataCleared = vi.fn();
    const onResetStarted = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <EmergencyResetSheet
        {...makeProps({
          onTripDataDeleted,
          onLocationDataCleared,
          onResetStarted,
          onOpenChange,
        })}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete Shared Trip Data" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm shared data deletion" }));

    await waitFor(() => {
      expect(mocks.emergencyReset).toHaveBeenCalledWith({
        token: "test-token",
        includeAuthSessions: false,
      });
    });
    expect(mocks.emergencyReset).toHaveBeenCalledTimes(1);
    expect(onTripDataDeleted).toHaveBeenCalled();
    expect(onLocationDataCleared).toHaveBeenCalled();
    expect(onResetStarted).toHaveBeenCalledWith("Shared trip data deletion started.");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("includes auth session deletion and triggers onLoggedOut when the checkbox is selected", async () => {
    const mocks = setupMutationMocks();
    const onLoggedOut = vi.fn();

    render(<EmergencyResetSheet {...makeProps({ onLoggedOut })} />);

    await userEvent.click(screen.getByRole("checkbox", { name: /log everyone off too/i }));
    await userEvent.click(screen.getByRole("button", { name: "Delete Shared Trip Data" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm shared data deletion" }));

    await waitFor(() => {
      expect(mocks.emergencyReset).toHaveBeenCalledWith({
        token: "test-token",
        includeAuthSessions: true,
      });
    });
    expect(onLoggedOut).toHaveBeenCalled();
  });

  it("shows a friendly rate-limit error message when the mutation rejects", async () => {
    const mocks = setupMutationMocks();
    mocks.emergencyReset.mockRejectedValue(new Error("rate limit exceeded -- too many requests"));

    render(<EmergencyResetSheet {...makeProps()} />);

    await userEvent.click(screen.getByRole("button", { name: "Delete Shared Trip Data" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm shared data deletion" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Too many emergency reset actions",
      );
    });
  });

  it("sends the auth-session success message to the toast callback", async () => {
    setupMutationMocks();
    const onResetStarted = vi.fn();
    render(<EmergencyResetSheet {...makeProps({ onResetStarted })} />);

    await userEvent.click(screen.getByRole("checkbox", { name: /log everyone off too/i }));
    await userEvent.click(screen.getByRole("button", { name: "Delete Shared Trip Data" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm shared data deletion" }));

    await waitFor(() => {
      expect(onResetStarted).toHaveBeenCalledWith(
        "Shared trip data deletion started. Everyone will also be logged off.",
      );
    });
  });
});

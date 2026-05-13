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
    ...overrides,
  };
}

// Mutation call order inside EmergencyResetSheet:
//   1st useMutation call → deleteAllCheckpoints
//   2nd useMutation call → clearTravelerLocation
//   3rd useMutation call → deleteAllTripData
//   4th useMutation call → logEveryoneOff
//   5th useMutation call → deleteTravelerState

function setupMutationMocks() {
  const mocks = {
    deleteAllCheckpoints: vi.fn().mockResolvedValue(null),
    clearTravelerLocation: vi.fn().mockResolvedValue(null),
    deleteAllTripData: vi.fn().mockResolvedValue(null),
    logEveryoneOff: vi.fn().mockResolvedValue(null),
    deleteTravelerState: vi.fn().mockResolvedValue(null),
  };
  const mockValues = [
    mocks.deleteAllCheckpoints,
    mocks.clearTravelerLocation,
    mocks.deleteAllTripData,
    mocks.logEveryoneOff,
    mocks.deleteTravelerState,
  ];
  let callCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(convexReact.useMutation).mockImplementation(() => mockValues[callCount++ % 5] as any);
  return mocks;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EmergencyResetSheet", () => {
  it("shows all five action buttons when open", () => {
    setupMutationMocks();
    render(<EmergencyResetSheet {...makeProps()} />);

    expect(screen.getByText("Delete Checkpoints")).toBeInTheDocument();
    expect(screen.getByText("Clear Live Location")).toBeInTheDocument();
    expect(screen.getByText("Delete All Trip Data")).toBeInTheDocument();
    expect(screen.getByText("Log Everyone Off")).toBeInTheDocument();
    expect(screen.getByText("Delete Traveler State")).toBeInTheDocument();
  });

  it("shows the confirmation dialog after clicking an action", async () => {
    setupMutationMocks();
    render(<EmergencyResetSheet {...makeProps()} />);

    await userEvent.click(screen.getByText("Delete All Trip Data"));

    // Confirm button with the action label should now appear.
    expect(screen.getByRole("button", { name: "Delete all trip data" })).toBeInTheDocument();
    // Cancel button is also visible.
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls deleteAllTripData and triggers both reset callbacks on confirm", async () => {
    const mocks = setupMutationMocks();
    const onTripDataDeleted = vi.fn();
    const onLocationDataCleared = vi.fn();

    render(
      <EmergencyResetSheet
        {...makeProps({ onTripDataDeleted, onLocationDataCleared })}
      />,
    );

    await userEvent.click(screen.getByText("Delete All Trip Data"));
    await userEvent.click(screen.getByRole("button", { name: "Delete all trip data" }));

    await waitFor(() => {
      expect(mocks.deleteAllTripData).toHaveBeenCalledWith({ token: "test-token" });
    });
    expect(onTripDataDeleted).toHaveBeenCalled();
    expect(onLocationDataCleared).toHaveBeenCalled();
  });

  it("calls logEveryoneOff and triggers onLoggedOut on confirm", async () => {
    const mocks = setupMutationMocks();
    const onLoggedOut = vi.fn();

    render(<EmergencyResetSheet {...makeProps({ onLoggedOut })} />);

    await userEvent.click(screen.getByText("Log Everyone Off"));
    await userEvent.click(screen.getByRole("button", { name: "Log everyone off" }));

    await waitFor(() => {
      expect(mocks.logEveryoneOff).toHaveBeenCalledWith({ token: "test-token" });
    });
    expect(onLoggedOut).toHaveBeenCalled();
  });

  it("shows a friendly rate-limit error message when the mutation rejects", async () => {
    const mocks = setupMutationMocks();
    mocks.logEveryoneOff.mockRejectedValue(new Error("rate limit exceeded — too many requests"));

    render(<EmergencyResetSheet {...makeProps()} />);

    await userEvent.click(screen.getByText("Log Everyone Off"));
    await userEvent.click(screen.getByRole("button", { name: "Log everyone off" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Too many emergency reset actions",
      );
    });
  });
});

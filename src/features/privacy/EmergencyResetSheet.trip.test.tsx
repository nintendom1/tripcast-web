import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerViewingPrivately } from "../../test/renderWithTrip";
import EmergencyResetSheet from "./EmergencyResetSheet";

const server = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  impl: (() => Promise.resolve(null)) as () => Promise<unknown>,
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: (ref: never) => (args: Record<string, unknown>) => {
      server.calls.push({ name: getFunctionName(ref), args });
      return server.impl();
    },
    useQuery: vi.fn(),
  };
});
vi.mock("../../debug/useActiveUiContext", () => ({ useActiveUiContext: vi.fn() }));

const props = () => ({
  open: true,
  token: "tok",
  onOpenChange: vi.fn(),
  onLoggedOut: vi.fn(),
  onLocationDataCleared: vi.fn(),
  onTripDataDeleted: vi.fn(),
  onResetStarted: vi.fn(),
});

beforeEach(() => {
  server.calls = [];
  server.impl = () => Promise.resolve(null);
});

const enabled = { ...travelerViewingPrivately };
const PHRASE = "ERASE ALL TRIPS";

async function toConfirm() {
  await userEvent.click(screen.getByRole("button", { name: "Erase ALL trips" }));
}

describe("Erase ALL trips (multi-trip enabled)", () => {
  it("says what it does: heading, the four facts, and an Erase ALL trips button", () => {
    render(
      <TripContextTestProvider value={enabled}>
        <EmergencyResetSheet {...props()} />
      </TripContextTestProvider>,
    );
    expect(screen.getByRole("heading", { name: "Erase ALL trips" })).toBeInTheDocument();
    const summary = screen.getByTestId("erase-all-trips-summary");
    expect(summary).toHaveTextContent("Removes every trip");
    expect(summary).toHaveTextContent("Leaves one new empty trip");
    expect(summary).toHaveTextContent("Keeps accounts and cloaking pins");
    expect(summary).toHaveTextContent("Stops live sharing");
    expect(screen.queryByRole("button", { name: "Delete Shared Trip Data" })).toBeNull();
  });

  it("the confirm button stays disabled until the exact phrase is typed, and nothing is sent on a wrong phrase", async () => {
    render(
      <TripContextTestProvider value={enabled}>
        <EmergencyResetSheet {...props()} />
      </TripContextTestProvider>,
    );
    await toConfirm();
    const confirm = screen.getByRole("button", { name: "Erase ALL trips" });
    const field = screen.getByLabelText(/Type ERASE ALL TRIPS to confirm/);
    expect(confirm).toBeDisabled();
    for (const wrong of ["erase all trips", "ERASE ALL TRIP", "ERASE ALL"]) {
      await userEvent.clear(field);
      await userEvent.type(field, wrong);
      expect(confirm).toBeDisabled();
    }
    await userEvent.click(confirm);
    expect(server.calls).toHaveLength(0);
    await userEvent.clear(field);
    await userEvent.type(field, `  ${PHRASE}  `);
    expect(confirm).toBeEnabled();
  });

  it("sends today's request once, returns to the shared trip, and reports that all trips were erased", async () => {
    const returnToCurrent = vi.fn();
    const p = props();
    render(
      <TripContextTestProvider value={{ ...enabled, returnToCurrent }}>
        <EmergencyResetSheet {...p} />
      </TripContextTestProvider>,
    );
    await toConfirm();
    await userEvent.type(screen.getByLabelText(/Type ERASE ALL TRIPS to confirm/), PHRASE);
    await userEvent.click(screen.getByRole("button", { name: "Erase ALL trips" }));
    await waitFor(() => expect(returnToCurrent).toHaveBeenCalledTimes(1));
    expect(server.calls).toEqual([{ name: "privacy:emergencyReset", args: { token: "tok", includeAuthSessions: false } }]);
    expect(p.onResetStarted).toHaveBeenCalledWith("All trips erased. One new empty trip is now shared.");
  });

  it("clears the typed phrase when the confirmation is cancelled", async () => {
    render(
      <TripContextTestProvider value={enabled}>
        <EmergencyResetSheet {...props()} />
      </TripContextTestProvider>,
    );
    await toConfirm();
    await userEvent.type(screen.getByLabelText(/Type ERASE ALL TRIPS to confirm/), PHRASE);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await toConfirm();
    expect(screen.getByLabelText(/Type ERASE ALL TRIPS to confirm/)).toHaveValue("");
    expect(screen.getByRole("button", { name: "Erase ALL trips" })).toBeDisabled();
  });

  it("does not return to current when the reset fails", async () => {
    server.impl = () => Promise.reject(new Error("rate limit: too many requests"));
    const returnToCurrent = vi.fn();
    render(
      <TripContextTestProvider value={{ ...enabled, returnToCurrent }}>
        <EmergencyResetSheet {...props()} />
      </TripContextTestProvider>,
    );
    await toConfirm();
    await userEvent.type(screen.getByLabelText(/Type ERASE ALL TRIPS to confirm/), PHRASE);
    await userEvent.click(screen.getByRole("button", { name: "Erase ALL trips" }));
    await screen.findByRole("alert");
    expect(returnToCurrent).not.toHaveBeenCalled();
  });
});

describe("Emergency Reset with multi-trip disabled or no provider", () => {
  it.each([["disabled", { role: "traveler" as const, multiTripEnabled: false }], ["no provider", undefined]])(
    "is exactly today's, with no typing (%s)",
    async (_label, value) => {
      const p = props();
      const body = <EmergencyResetSheet {...p} />;
      render(value ? <TripContextTestProvider value={value}>{body}</TripContextTestProvider> : body);
      expect(screen.getByRole("heading", { name: "Emergency Reset" })).toBeInTheDocument();
      expect(screen.queryByTestId("erase-all-trips-summary")).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: "Delete Shared Trip Data" }));
      expect(screen.queryByRole("textbox")).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: "Confirm shared data deletion" }));
      await waitFor(() => expect(server.calls).toHaveLength(1));
      expect(p.onResetStarted).toHaveBeenCalledWith("Shared trip data deletion started.");
    },
  );
});

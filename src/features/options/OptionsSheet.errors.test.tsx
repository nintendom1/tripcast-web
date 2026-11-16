import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentTrip } from "../../convex/tripcastApi";
import { clearLogs, getLogs } from "../../debug/debugLogger";
import type { StoredSession } from "../../lib/auth";
import { ThemeProvider } from "../../providers/ThemeProvider";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerFollowingCurrent } from "../../test/renderWithTrip";
import type { TripContextValue } from "../trips/tripTypes";
import OptionsSheet from "./OptionsSheet";

const server = vi.hoisted(() => ({
  fundsThrows: false,
  throwOnQuery: null as null | string,
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: () => () => Promise.resolve(null),
    useQuery: (ref: never, args: unknown) => {
      if (server.throwOnQuery && getFunctionName(ref) === server.throwOnQuery) {
        throw new Error("Server Error");
      }
      return args === "skip" ? undefined : undefined;
    },
  };
});

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("../followers/CreateInviteControl", () => ({ default: () => null }));
vi.mock("../privacy/EmergencyResetSheet", () => ({ EmergencyResetContent: () => null }));
vi.mock("./BulkImportSheet", () => ({ default: () => null }));
vi.mock("./BulkExportSheet", () => ({ default: () => null }));
vi.mock("../../debug/DebugPanel", () => ({ default: () => null }));
vi.mock("../travelfunds/TravelFundsSheet", () => ({
  default: () => {
    if (server.fundsThrows) throw new Error("fundsStartAt must be a non-negative timestamp.");
    return <div data-testid="funds-sheet" />;
  },
}));

const session: StoredSession = { token: "test-token", role: "traveler", sessionType: "legacy", displayName: "Traveler" };
const current: CurrentTrip = {
  tripId: "trip-current",
  title: "Current Trip",
  lifecycle: "in_progress",
  isLegacy: false,
  revision: 1,
  publishingEpoch: 1,
  epochStartedAt: 1,
  multiTripEnabled: true,
};
const following: Partial<TripContextValue> = { ...travelerFollowingCurrent, currentTrip: current };

function renderOptions() {
  const onOpenChange = vi.fn();
  render(
    <TripContextTestProvider value={following}>
      <ThemeProvider>
        <OptionsSheet
          open
          onOpenChange={onOpenChange}
          session={session}
          role="traveler"
          onSignOut={vi.fn()}
          onManageFollowers={vi.fn()}
          onReplayFollowerTour={vi.fn()}
          onLoggedOut={vi.fn()}
          onLocationDataCleared={vi.fn()}
          onTripDataDeleted={vi.fn()}
          onResetStarted={vi.fn()}
        />
      </ThemeProvider>
    </TripContextTestProvider>,
  );
  return { onOpenChange };
}

const boundaryErrors = () => getLogs().filter((entry) => entry.action === "react:feature-boundary-error");

beforeEach(() => {
  server.fundsThrows = false;
  server.throwOnQuery = null;
  localStorage.clear();
  sessionStorage.clear();
  clearLogs();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Options page error containment", () => {
  it("a failing Travel Funds page shows a card inside Options and keeps the header, Back and the app", async () => {
    server.fundsThrows = true;
    renderOptions();

    await userEvent.click(await screen.findByRole("button", { name: /Manage Travel Funds/ }));

    const card = await screen.findByRole("alert");
    expect(card).toHaveTextContent("Travel Funds hit a problem.");
    expect(screen.queryByText("TripCast hit a problem.")).not.toBeInTheDocument();
    // The Options header (title and Back) is still drawn above the card.
    expect(screen.getByRole("heading", { name: "Travel Funds" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();

    const entries = boundaryErrors();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ details: { title: "Travel Funds hit a problem." } });
  });

  it("Close returns to the Options home page, and the next page opens normally", async () => {
    server.fundsThrows = true;
    renderOptions();
    await userEvent.click(await screen.findByRole("button", { name: /Manage Travel Funds/ }));
    const card = await screen.findByRole("alert");

    server.fundsThrows = false;
    await userEvent.click(within(card).getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await userEvent.click(await screen.findByRole("button", { name: /Trip Ticker/ }));
    expect(await screen.findByRole("heading", { name: "Trip Ticker" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByTestId("funds-sheet")).not.toBeInTheDocument();
  });

  it("a second page shows its own title", async () => {
    server.throwOnQuery = "ticker:getTickerSettings";
    renderOptions();

    await userEvent.click(await screen.findByRole("button", { name: /Trip Ticker/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Trip Ticker hit a problem.");
    expect(screen.queryByText("TripCast hit a problem.")).not.toBeInTheDocument();
    expect(boundaryErrors()).toHaveLength(1);
    expect(boundaryErrors()[0]).toMatchObject({ details: { title: "Trip Ticker hit a problem." } });
  });

  it("a failing read on the Options home page shows a card whose Close closes Options", async () => {
    server.throwOnQuery = "scoring:travelerGetScoringSettings";
    const { onOpenChange } = renderOptions();

    const card = await screen.findByRole("alert");
    expect(card).toHaveTextContent("Options hit a problem.");
    expect(screen.queryByText("TripCast hit a problem.")).not.toBeInTheDocument();

    await userEvent.click(within(card).getByRole("button", { name: "Close" }));

    // Going "back to home" would leave the card in place: on home, Close closes Options.
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Back still works from the card", async () => {
    server.fundsThrows = true;
    renderOptions();
    await userEvent.click(await screen.findByRole("button", { name: /Manage Travel Funds/ }));
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(await screen.findByRole("button", { name: /Manage Travel Funds/ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

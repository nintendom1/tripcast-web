import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { StatusCardConnected } from "./StatusCardConnected";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StatusCardConnected", () => {
  it("does not render placeholder state meters for Followers when state is hidden", () => {
    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
      if (ref === tripcastApi.travelerState.supportCrewGetTravelerState) {
        return { visible: false };
      }
      if (ref === tripcastApi.travelerAutoState.supportCrewGetAutoState) {
        return { visible: false };
      }
      if (ref === tripcastApi.currentActivity.supportCrewGetCurrentActivity) {
        return {
          _id: "activity-1",
          _creationTime: 1,
          status: "active",
          title: "Museum",
          startedAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBySessionId: "session-1",
          updatedBySessionId: "session-1",
        };
      }
      return undefined;
    });

    render(<StatusCardConnected token="token" role="support_crew" onOpenState={vi.fn()} />);

    expect(screen.getByText("Museum")).toBeInTheDocument();
    expect(screen.queryByText("Energy")).not.toBeInTheDocument();
    expect(screen.queryByText("Stomach")).not.toBeInTheDocument();
    expect(screen.queryByText("Calm")).not.toBeInTheDocument();
  });
});

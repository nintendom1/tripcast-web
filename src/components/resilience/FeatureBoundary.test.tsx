import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as debugLogger from "../../debug/debugLogger";
import { clearLogs, getLogs, setEnabled } from "../../debug/debugLogger";
import { FeatureBoundary } from "./FeatureBoundary";

function Throws(): ReactElement {
  throw new Error("feature exploded");
}

beforeEach(() => {
  localStorage.clear();
  clearLogs();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FeatureBoundary", () => {
  it("shows compact recovery UI and keeps the caller close action available", async () => {
    const onClose = vi.fn();

    render(
      <FeatureBoundary title="Votes hit a problem." onClose={onClose}>
        <Throws />
      </FeatureBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Votes hit a problem.");
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("records one feature-boundary error with the title, even with Debug Logging off", () => {
    render(
      <FeatureBoundary title="Votes hit a problem.">
        <Throws />
      </FeatureBoundary>,
    );

    const entries = getLogs().filter((entry) => entry.action === "react:feature-boundary-error");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "error",
      category: "error",
      src: "FeatureBoundary",
      details: { title: "Votes hit a problem.", message: "feature exploded", name: "Error" },
    });
  });

  it("records the server's reason from a ConvexError-style `data` field", () => {
    function ThrowsServerError(): ReactElement {
      throw Object.assign(new Error("[CONVEX Q(travelFunds:travelerGetConfig)] Server Error"), {
        name: "ConvexError",
        data: "fundsStartAt must be a non-negative timestamp.",
      });
    }

    render(
      <FeatureBoundary title="Funds chip hit a problem.">
        <ThrowsServerError />
      </FeatureBoundary>,
    );

    const entries = getLogs().filter((entry) => entry.action === "react:feature-boundary-error");
    expect(entries).toHaveLength(1);
    expect(entries[0].details).toMatchObject({
      name: "ConvexError",
      data: "fundsStartAt must be a non-negative timestamp.",
    });
  });

  it("logs a Retry press when logging is on and re-renders the child", async () => {
    setEnabled(true);
    let shouldThrow = true;
    function Flaky(): ReactElement {
      if (shouldThrow) throw new Error("flaky");
      return <p>recovered</p>;
    }

    render(
      <FeatureBoundary title="Funds chip hit a problem.">
        <Flaky />
      </FeatureBoundary>,
    );
    shouldThrow = false;
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(screen.getByText("recovered")).toBeInTheDocument();
    const retries = getLogs().filter((entry) => entry.action === "feature:fallback:retry");
    expect(retries).toHaveLength(1);
    expect(retries[0]).toMatchObject({ level: "info", category: "error", details: { title: "Funds chip hit a problem." } });
  });

  it("does not record a Retry press while logging is off", async () => {
    render(
      <FeatureBoundary title="Votes hit a problem.">
        <Throws />
      </FeatureBoundary>,
    );
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(getLogs().some((entry) => entry.action === "feature:fallback:retry")).toBe(false);
  });

  it("keeps the fallback and Retry working when the logger throws", async () => {
    const spy = vi.spyOn(debugLogger, "log").mockImplementation(() => {
      throw new Error("storage full");
    });
    let shouldThrow = true;
    function Flaky(): ReactElement {
      if (shouldThrow) throw new Error("flaky");
      return <p>recovered</p>;
    }

    render(
      <FeatureBoundary title="Votes hit a problem.">
        <Flaky />
      </FeatureBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Votes hit a problem.");
    shouldThrow = false;
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(spy).toHaveBeenCalled();
    expect(screen.getByText("recovered")).toBeInTheDocument();
  });

  it("contains a failing Funds sheet child in a card with Close while siblings keep working", async () => {
    const onClose = vi.fn();
    // Stand-in for the Funds sheet: no existing test renders the real one through TripMap.
    function FundsSheetStandIn(): ReactElement {
      throw new Error("fundsStartAt must be a non-negative timestamp.");
    }
    function Screen(): ReactElement {
      const [count, setCount] = useState(0);
      return (
        <div>
          <button type="button" onClick={() => setCount((n) => n + 1)}>
            sibling {count}
          </button>
          <FeatureBoundary title="Travel Funds hit a problem." onClose={onClose}>
            <FundsSheetStandIn />
          </FeatureBoundary>
        </div>
      );
    }

    render(<Screen />);

    expect(screen.getByRole("alert")).toHaveTextContent("Travel Funds hit a problem.");
    await userEvent.click(screen.getByRole("button", { name: "sibling 0" }));
    expect(screen.getByRole("button", { name: "sibling 1" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

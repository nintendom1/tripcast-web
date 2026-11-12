import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { useTripPaneActions } from "./useTripPaneActions";

const chunk = vi.hoisted(() => ({ loads: 0 }));

// The create sheet is a lazy chunk. This stub fails its first load, then succeeds, so a test can see the contained
// failure and the retry (React.lazy would cache the rejection, so each retry needs a fresh lazy import).
vi.mock("./CreateTripSheet", () => {
  chunk.loads += 1;
  if (chunk.loads === 1) throw new Error("chunk failed");
  return { CreateTripSheet: () => <div role="dialog" aria-label="Create trip" /> };
});

function Header() {
  const { props, nodes } = useTripPaneActions({ closePane: () => {} });
  return (
    <header>
      <button type="button" onClick={props.onRequestCreate}>
        Open create
      </button>
      {nodes}
    </header>
  );
}

describe("useTripPaneActions: create sheet chunk", () => {
  it("contains a failed chunk load with a retry that loads a fresh import, leaving the header up", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole("button", { name: "Open create" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Create trip could not load.");
    // The header around it is untouched (the failure did not reach a page-level boundary).
    expect(screen.getByRole("button", { name: "Open create" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("dialog", { name: "Create trip" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

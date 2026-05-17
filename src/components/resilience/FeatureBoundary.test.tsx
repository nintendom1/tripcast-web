import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { FeatureBoundary } from "./FeatureBoundary";

function Throws(): ReactElement {
  throw new Error("feature exploded");
}

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
});

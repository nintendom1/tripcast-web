import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionVerificationLiveControl } from "./SessionVerificationLiveControl";

describe("SessionVerificationLiveControl", () => {
  it("lets a Traveler resume Live while session verification continues", () => {
    const onToggle = vi.fn();

    render(
      <SessionVerificationLiveControl
        live={false}
        phase="idle"
        onToggle={onToggle}
      />,
    );

    expect(screen.getByText(/starts gps now while tripcast verifies/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume Live" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("reports an offline breadcrumb queue while Live remains enabled", () => {
    render(
      <SessionVerificationLiveControl
        live={true}
        phase="active"
        trackingMode="legacy"
        publishingPhase="offline"
        pendingBreadcrumbs={3}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Pause Live" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("3 breadcrumbs are saved on this iPhone.")).toBeInTheDocument();
  });
});

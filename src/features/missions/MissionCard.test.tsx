import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Mission } from "../../convex/tripcastApi";
import MissionCard from "./MissionCard";

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    _id: "Mission-1",
    _creationTime: 1,
    title: "Try a tiny neighborhood bakery with a surprisingly long name",
    description: "Climb to the top of the ridge for a view of the valley.",
    status: "in_progress",
    source: "traveler",
    createdAt: 1,
    updatedAt: 1,
    createdBySessionId: "session-1",
    updatedBySessionId: "session-1",
    ...overrides,
  } as Mission;
}

describe("MissionCard", () => {
  it("truncates the long title and constrains the status pill", () => {
    render(<MissionCard Mission={makeMission()} />);

    expect(screen.getByText("Try a tiny neighborhood bakery with a surprisingly long name"))
      .toHaveClass("min-w-0", "line-clamp-2");
    expect(screen.getByText("Active")).toHaveClass("max-w-[48%]", "truncate");
  });

  it("renders an aria-hidden flex spacer when the description is missing so reactions still right-justify", () => {
    const { container } = render(
      <MissionCard Mission={makeMission({ description: undefined })} token="t" />,
    );

    const spacer = container.querySelector('[aria-hidden="true"].md\\:flex-1');
    expect(spacer).not.toBeNull();
  });

  it("fires onClick when the card body is clicked", () => {
    const onClick = vi.fn();
    render(<MissionCard Mission={makeMission()} onClick={onClick} />);

    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TERMS } from "../../copy/terminology";
import { StatusCard } from "./StatusCard";

describe("StatusCard", () => {
  it("renders a subtle clock and aligned meter label rows", () => {
    render(
      <StatusCard
        activityLabel="Idle"
        clockLabel="9:52 AM"
        meters={[
          { label: "Energy", value: 60, autoChip: true },
          { label: "Stomach", value: 70, max: 150, autoChip: true },
          { label: "Calm", value: 50 },
        ]}
      />,
    );

    expect(screen.getByText("9:52 AM")).toHaveClass("text-[10px]", "font-semibold", "text-[var(--ink-3)]");
    expect(screen.getAllByLabelText(TERMS.autoEstimated)).toHaveLength(2);
    expect(screen.getByText("Energy").parentElement).toHaveClass("min-h-[22px]");
    expect(screen.getByText("Stomach").parentElement).toHaveClass("min-h-[22px]");
    expect(screen.getByText("Calm").parentElement).toHaveClass("min-h-[22px]");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusCard } from "./StatusCard";

describe("StatusCard", () => {
  it("renders a clock pill and numeric meter values", () => {
    render(
      <StatusCard
        activityLabel="Idle"
        clockLabel="9:52 AM"
        meters={[
          { label: "Energy", value: 60, valueLabel: "60%" },
          { label: "Fullness", value: 70, max: 100, valueLabel: "70%" },
          { label: "Calm", value: 50, valueLabel: "50%" },
        ]}
      />,
    );

    expect(screen.getByText("9:52 AM")).toHaveClass("text-[10px]", "font-semibold", "text-[var(--ink-2)]");
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Fullness")).toBeInTheDocument();
  });
});

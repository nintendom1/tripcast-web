import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import TravelFundsMeter from "./TravelFundsMeter";

function getMeter(): HTMLElement {
  return screen.getByRole("meter");
}

function getFillElement(): HTMLElement {
  // The fill bar is the only element with `width:` inline style under the meter.
  const meter = getMeter();
  const fill = meter.querySelector("[style*='width']");
  if (!(fill instanceof HTMLElement)) throw new Error("fill element not found");
  return fill;
}

describe("TravelFundsMeter — under budget", () => {
  it("shows '$X left' and fills proportionally to remaining/starting", () => {
    render(<TravelFundsMeter startingBudgetUsd={100} remainingUsd={80} />);
    expect(screen.getByText(/\$80\.00 left/)).toBeInTheDocument();
    const fill = getFillElement();
    expect(fill.style.width).toBe("80%");
  });

  it("uses amber color tint when remaining ratio falls below 25%", () => {
    render(<TravelFundsMeter startingBudgetUsd={100} remainingUsd={20} />);
    const fill = getFillElement();
    expect(fill.className).toContain("amber");
  });
});

describe("TravelFundsMeter — over budget", () => {
  it("shows '-$X over' and switches to rose color", () => {
    render(<TravelFundsMeter startingBudgetUsd={100} remainingUsd={-20} />);
    expect(screen.getByText(/-\$20\.00 over/)).toBeInTheDocument();
    const fill = getFillElement();
    expect(fill.className).toContain("rose");
    expect(fill.style.width).toBe("20%");
  });

  it("caps the bar at full width when overage equals starting budget", () => {
    render(<TravelFundsMeter startingBudgetUsd={100} remainingUsd={-100} />);
    expect(screen.getByText(/-\$100\.00 over/)).toBeInTheDocument();
    expect(getFillElement().style.width).toBe("100%");
  });

  it("keeps the bar at 100% but still shows true overage when overage exceeds budget", () => {
    render(<TravelFundsMeter startingBudgetUsd={100} remainingUsd={-180} />);
    expect(screen.getByText(/-\$180\.00 over/)).toBeInTheDocument();
    expect(getFillElement().style.width).toBe("100%");
  });
});

describe("TravelFundsMeter — no budget", () => {
  it("renders 'Spent $X' with no bar when startingBudgetUsd is zero", () => {
    render(<TravelFundsMeter startingBudgetUsd={0} remainingUsd={-15} />);
    expect(screen.getByText(/Spent \$15\.00/)).toBeInTheDocument();
    expect(getFillElement().style.width).toBe("0%");
  });
});

describe("TravelFundsMeter — accessibility", () => {
  it("exposes a meter role with descriptive aria-valuetext", () => {
    render(<TravelFundsMeter startingBudgetUsd={100} remainingUsd={80} label="Tokyo" />);
    const meter = getMeter();
    expect(meter.getAttribute("aria-valuemin")).toBe("0");
    expect(meter.getAttribute("aria-valuemax")).toBe("100");
    expect(meter.getAttribute("aria-valuenow")).toBe("80");
    expect(meter.getAttribute("aria-valuetext")).toMatch(
      /\$80\.00 remaining of \$100\.00/,
    );
  });

  it("changes valuetext to 'over budget' when over", () => {
    render(<TravelFundsMeter startingBudgetUsd={100} remainingUsd={-25} />);
    expect(getMeter().getAttribute("aria-valuetext")).toMatch(/over budget/);
  });

  it("renders the optional label in full variant", () => {
    render(
      <TravelFundsMeter
        startingBudgetUsd={100}
        remainingUsd={80}
        variant="full"
        label="Tokyo"
      />,
    );
    expect(screen.getByText("Tokyo")).toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FanMenu } from "./FanMenu";
import { ThemeProvider } from "../../providers/ThemeProvider";

const baseProps = {
  open: true,
  onClose: vi.fn(),
  onPick: vi.fn(),
};

describe("FanMenu", () => {
  it("renders the expected traveler actions including Update Status", () => {
    render(
      <ThemeProvider>
        <FanMenu {...baseProps} />
      </ThemeProvider>
    );
    expect(screen.getByRole("menuitem", { name: /Check In \/ Story/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Add Spending/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Create Mission/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Update Status/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Create Route Vote/i })).toBeInTheDocument();
  });

  it("calls onPick with 'status' when Update Status is clicked", () => {
    const onPick = vi.fn();
    render(
      <ThemeProvider>
        <FanMenu {...baseProps} onPick={onPick} />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByRole("menuitem", { name: /Update Status/i }));
    expect(onPick).toHaveBeenCalledWith("status");
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <ThemeProvider>
        <FanMenu {...baseProps} onClose={onClose} />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByLabelText(/Close quick actions/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

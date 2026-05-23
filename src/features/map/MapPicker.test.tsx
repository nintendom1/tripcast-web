import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { LocationPickerField } from "./MapPicker";

describe("LocationPickerField", () => {
  it("shows the pick button when no coordinate is set and triggers onPick", () => {
    const onPick = vi.fn();
    render(<LocationPickerField onPick={onPick} onClear={vi.fn()} />);

    const button = screen.getByRole("button", { name: /pick location on map/i });
    fireEvent.click(button);
    expect(onPick).toHaveBeenCalledTimes(1);
    // No coordinate chip yet.
    expect(screen.queryByText(/47\.60621/)).not.toBeInTheDocument();
  });

  it("shows the coordinate chip with Change/Clear once a coordinate is set", () => {
    const onPick = vi.fn();
    const onClear = vi.fn();
    render(
      <LocationPickerField lat={47.60621} lon={-122.33207} onPick={onPick} onClear={onClear} />,
    );

    expect(screen.getByText("47.60621, -122.33207")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(onPick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("uses a custom label when provided", () => {
    render(<LocationPickerField label="Mission location" onPick={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText("Mission location")).toBeInTheDocument();
  });
});

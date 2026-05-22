import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Dock, type DockTab } from "./Dock";

const baseProps = {
  active: null as DockTab | null,
  onSelect: vi.fn(),
  onAdd: vi.fn(),
};

describe("Dock", () => {
  it("renders Journal, Missions, and Votes buttons", () => {
    render(<Dock {...baseProps} />);
    expect(screen.getByRole("button", { name: "Journal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Missions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Votes" })).toBeInTheDocument();
  });

  it("shows the Add FAB by default", () => {
    render(<Dock {...baseProps} addLabel="Add" />);
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("hides the Add FAB when showAdd=false", () => {
    render(<Dock {...baseProps} showAdd={false} />);
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("shows 'Close actions' aria-label when fanOpen=true", () => {
    render(<Dock {...baseProps} fanOpen={true} addLabel="Add" />);
    expect(screen.getByRole("button", { name: "Close actions" })).toBeInTheDocument();
  });

  it("shows Funds by default and hides it when showFunds=false", () => {
    const { rerender } = render(<Dock {...baseProps} />);
    expect(screen.getByRole("button", { name: "Funds" })).toBeInTheDocument();
    rerender(<Dock {...baseProps} showFunds={false} />);
    expect(screen.queryByRole("button", { name: "Funds" })).not.toBeInTheDocument();
  });

  it("hides Awards by default and shows it when showAchievements=true", () => {
    const { rerender } = render(<Dock {...baseProps} />);
    expect(screen.queryByRole("button", { name: "Awards" })).not.toBeInTheDocument();
    rerender(<Dock {...baseProps} showAchievements={true} />);
    expect(screen.getByRole("button", { name: "Awards" })).toBeInTheDocument();
  });

  it("renders a badge count when journal badge is non-zero", () => {
    render(<Dock {...baseProps} badges={{ journal: 4 }} />);
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("caps badge display at '9+' when count exceeds 9", () => {
    render(<Dock {...baseProps} badges={{ missions: 12 }} />);
    expect(screen.getByText("9+")).toBeInTheDocument();
  });

  it("calls onSelect with the correct tab key when buttons are clicked", () => {
    const onSelect = vi.fn();
    render(<Dock {...baseProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Journal" }));
    expect(onSelect).toHaveBeenCalledWith("journal");
    fireEvent.click(screen.getByRole("button", { name: "Missions" }));
    expect(onSelect).toHaveBeenCalledWith("missions");
    fireEvent.click(screen.getByRole("button", { name: "Votes" }));
    expect(onSelect).toHaveBeenCalledWith("votes");
  });

  it("calls onAdd when the Add FAB is clicked", () => {
    const onAdd = vi.fn();
    render(<Dock {...baseProps} onAdd={onAdd} addLabel="Add" />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("marks the active tab button as pressed", () => {
    render(<Dock {...baseProps} active="journal" />);
    expect(screen.getByRole("button", { name: "Journal" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Missions" })).toHaveAttribute("aria-pressed", "false");
  });
});

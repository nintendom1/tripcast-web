import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ReplayDateRangeSheet from "./ReplayDateRangeSheet";

const bounds = {
  min: Date.UTC(2026, 5, 1, 0, 0),
  max: Date.UTC(2026, 5, 5, 0, 0),
};

describe("ReplayDateRangeSheet", () => {
  beforeEach(() => localStorage.clear());

  it("applies timezone-aware datetime fields and remembers the last valid custom range", async () => {
    const onApply = vi.fn();
    const { rerender } = render(
      <ReplayDateRangeSheet open bounds={bounds} window={null} timeZone="Asia/Tokyo" onApply={onApply} onReset={() => {}} onClose={() => {}} />,
    );
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "2026-06-02T09:00" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "2026-06-03T09:00" } });
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(Date.UTC(2026, 5, 2, 0, 0), Date.UTC(2026, 5, 3, 0, 0));

    rerender(<ReplayDateRangeSheet open={false} bounds={bounds} window={null} timeZone="Asia/Tokyo" onApply={onApply} onReset={() => {}} onClose={() => {}} />);
    rerender(<ReplayDateRangeSheet open bounds={bounds} window={null} timeZone="Asia/Tokyo" onApply={onApply} onReset={() => {}} onClose={() => {}} />);
    expect(screen.getByLabelText("Start")).toHaveValue("2026-06-02T09:00");
  });

  it("rejects an end before the start", () => {
    render(<ReplayDateRangeSheet open bounds={bounds} window={null} timeZone="UTC" onApply={() => {}} onReset={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "2026-06-04T00:00" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "2026-06-03T00:00" } });
    expect(screen.getByRole("alert")).toHaveTextContent("End must be at or after start");
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("provides Today, Yesterday, Last 24 hours, and Full trip shortcuts", async () => {
    const onReset = vi.fn();
    render(<ReplayDateRangeSheet open bounds={bounds} window={null} timeZone="UTC" onApply={() => {}} onReset={onReset} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Today" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Yesterday" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Last 24 hours" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Full trip" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

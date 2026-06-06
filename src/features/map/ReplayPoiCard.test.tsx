import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReplayPoiCard } from "./ReplayPoiCard";

describe("ReplayPoiCard", () => {
  it("renders the title and note", () => {
    render(<ReplayPoiCard title="Queen Anne Viewpoint" note="City views" />);
    expect(screen.getByText("Queen Anne Viewpoint")).toBeInTheDocument();
    expect(screen.getByText("City views")).toBeInTheDocument();
  });

  it("omits the note when none is provided", () => {
    render(<ReplayPoiCard title="Pike Place" />);
    expect(screen.getByText("Pike Place")).toBeInTheDocument();
    expect(screen.queryByText("City views")).not.toBeInTheDocument();
  });

  it("renders the scrapbook photo only when an image URL is present", () => {
    // The photo uses alt="" (decorative), so query the element directly.
    const { container, rerender } = render(<ReplayPoiCard title="Stop" />);
    expect(container.querySelector("img")).toBeNull();

    rerender(<ReplayPoiCard title="Stop" imageUrl="https://example.test/p.jpg" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://example.test/p.jpg");
  });

  it("invokes onClick when tapped", async () => {
    const onClick = vi.fn();
    render(<ReplayPoiCard title="Stop" onClick={onClick} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

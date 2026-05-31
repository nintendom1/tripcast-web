import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TripTicker } from "./TripTicker";

describe("TripTicker", () => {
  const mockMessage = { id: "1", text: "Test Message" };

  it("renders the message text", () => {
    render(<TripTicker message={mockMessage} />);
    expect(screen.getByText("Test Message")).toBeDefined();
  });

  it("shows TRIVIA label for fun facts", () => {
    render(<TripTicker message={mockMessage} isPriority={false} />);
    expect(screen.getByText("TRIVIA")).toBeDefined();
  });

  it("shows NOTICE label for priority messages", () => {
    render(<TripTicker message={mockMessage} isPriority={true} />);
    expect(screen.getByText("NOTICE")).toBeDefined();
  });

  it("returns null when no message is provided", () => {
    const { container } = render(<TripTicker message={null} />);
    expect(container.firstChild).toBeNull();
  });
});

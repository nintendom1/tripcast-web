import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as convexReact from "convex/react";

import AttributionBlock from "./AttributionBlock";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(convexReact.useQuery).mockReturnValue(undefined as any);
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn().mockResolvedValue(null) as any);
});

describe("AttributionBlock — editable prop", () => {
  it("shows the Edit credits control for a Traveler by default", () => {
    render(<AttributionBlock token="t" viewerRole="traveler" sourceType="story" sourceId="s1" />);
    expect(screen.getByRole("button", { name: "Edit credits" })).toBeInTheDocument();
  });

  it("hides the Edit credits control when editable is false", () => {
    render(
      <AttributionBlock
        token="t"
        viewerRole="traveler"
        sourceType="story"
        sourceId="s1"
        editable={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Edit credits" })).not.toBeInTheDocument();
  });
});

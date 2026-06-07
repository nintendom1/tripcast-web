import { render, screen } from "@testing-library/react";
import { Activity } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { FeatureShowcase, TRIPCAST_FEATURES } from "./FeatureShowcase";

vi.mock("framer-motion", async () => {
  const ReactModule = await import("react");
  const make = (tag: string) =>
    ReactModule.forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => {
      const {
        animate: _a,
        initial: _i,
        exit: _e,
        transition: _t,
        whileInView: _w,
        viewport: _v,
        ...rest
      } = props;
      return ReactModule.createElement(tag, { ref, ...rest });
    });
  const motion = new Proxy(
    {},
    { get: (_target, tag: string) => make(tag) },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useInView: () => true,
  };
});

describe("TRIPCAST_FEATURES", () => {
  it("places the Pulse callout in the middle, between Missions and Votes", () => {
    const kickers = TRIPCAST_FEATURES.map((f) => f.kicker);
    expect(kickers).toEqual(["Stories", "Missions", "Pulse", "Votes", "Badges"]);
  });

  it("wires the Pulse callout to the traveler-state scene (beat 6) and Activity icon", () => {
    const pulse = TRIPCAST_FEATURES[2];
    expect(pulse.kicker).toBe("Pulse");
    expect(pulse.beat).toBe(6);
    expect(pulse.Icon).toBe(Activity);
  });
});

describe("FeatureShowcase", () => {
  it("renders every callout heading in order with the Pulse traveler-state meters", () => {
    render(<FeatureShowcase isDark={false} reduceMotion />);

    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      "Read what they post from each stop.",
      "Suggest something for the traveler to try.",
      "Know how they're really doing.",
      "Help choose between good options.",
      "See who helped shape the trip.",
    ]);

    expect(screen.getByText("Energy")).toBeInTheDocument();
    expect(screen.getByText("Fullness")).toBeInTheDocument();
    expect(screen.getByText("Calm")).toBeInTheDocument();
  });
});

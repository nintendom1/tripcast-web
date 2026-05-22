import * as React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import { CreateAccountIntroFlow, IntroSequence } from "./IntroSequence";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
}));

vi.mock("framer-motion", async () => {
  const ReactModule = await import("react");

  type MotionProps<T extends HTMLElement> = React.HTMLAttributes<T> & {
    animate?: React.CSSProperties;
    initial?: unknown;
    exit?: unknown;
    transition?: unknown;
  };

  function motionStyle<T extends HTMLElement>({ animate, style }: MotionProps<T>) {
    return {
      ...style,
      ...(animate && !Array.isArray(animate) ? animate : {}),
    };
  }

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      div: ReactModule.forwardRef<HTMLDivElement, MotionProps<HTMLDivElement>>(
        ({ animate, initial: _initial, exit: _exit, transition: _transition, style, ...props }, ref) => (
          <div ref={ref} {...props} style={motionStyle<HTMLDivElement>({ animate, style })} />
        ),
      ),
      h1: ReactModule.forwardRef<HTMLHeadingElement, MotionProps<HTMLHeadingElement>>(
        ({ animate, initial: _initial, exit: _exit, transition: _transition, style, ...props }, ref) => (
          <h1 ref={ref} {...props} style={motionStyle<HTMLHeadingElement>({ animate, style })} />
        ),
      ),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn().mockResolvedValue(null) as any);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("IntroSequence", () => {
  it("keeps rapid continue clicks inside the beat bounds and finishes once", () => {
    const onDone = vi.fn();
    render(
      <IntroSequence
        role="follower"
        userHandle="alice"
        travelerName="Traveler"
        onDone={onDone}
      />,
    );

    const nextButton = screen.getByRole("button", { name: /next/i });
    act(() => {
      for (let i = 0; i < 12; i += 1) {
        fireEvent.click(nextButton);
      }
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith("done");
  });

  it("supports keyboard back and forward navigation", () => {
    const onDone = vi.fn();
    render(
      <IntroSequence
        role="follower"
        userHandle="alice"
        travelerName="Traveler"
        onDone={onDone}
      />,
    );

    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByRole("heading", { name: /read the postcards/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByRole("heading", { name: /watch, shape, and share/i })).toBeInTheDocument();
  });
});

describe("CreateAccountIntroFlow", () => {
  it("fades Welcome in, holds it, then fades it out before the intro starts", () => {
    vi.useFakeTimers();

    render(
      <CreateAccountIntroFlow
        token="session-token"
        role="follower"
        accountLabel="alice"
        userHandle="alice"
        travelerName="Traveler"
        onDone={vi.fn()}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(3501);
    });
    expect(screen.getByRole("heading", { name: "Welcome" })).toHaveStyle({ opacity: "1" });

    act(() => {
      vi.advanceTimersByTime(3499);
    });
    expect(screen.getByRole("heading", { name: "Welcome" })).toHaveStyle({ opacity: "0" });

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole("button", { name: /^skip$/i })).toBeInTheDocument();
  });
});

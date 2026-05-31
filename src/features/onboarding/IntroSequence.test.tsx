import * as React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import { CreateAccountIntroFlow, IntroSequence } from "./IntroSequence";
import { ThemeProvider } from "../../providers/ThemeProvider";

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
      path: ReactModule.forwardRef<SVGPathElement, React.SVGProps<SVGPathElement> & { animate?: unknown; initial?: unknown; exit?: unknown; transition?: unknown }>(
        ({ animate: _a, initial: _i, exit: _e, transition: _t, ...props }, ref) => (
          <path ref={ref} {...props} />
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

  it("asks for theme preference and applies auto dark during dark hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T21:00:00"));
    localStorage.setItem("tripcast.theme_mode", "meadow");
    render(
      <ThemeProvider>
        <IntroSequence
          role="follower"
          userHandle="alice"
          travelerName="Traveler"
          onDone={vi.fn()}
        />
      </ThemeProvider>,
    );

    act(() => {
      for (let i = 0; i < 5; i += 1) {
        fireEvent.click(screen.getByRole("button", { name: /next/i }));
      }
    });

    expect(screen.getByRole("heading", { name: /light, dark, or auto/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Auto" }));

    expect(localStorage.getItem("tripcast.theme_mode")).toBe("auto");
    expect(document.documentElement).toHaveClass("theme-dark");
  });
});

describe("IntroSequence — dark preview", () => {
  function navigateToThemeBeat() {
    act(() => {
      for (let i = 0; i < 5; i += 1) {
        fireEvent.click(screen.getByRole("button", { name: /next/i }));
      }
    });
  }

  it("intro opens dark on beat 0 when mode is auto and time is night", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T21:00:00"));
    localStorage.setItem("tripcast.theme_mode", "auto");
    render(
      <ThemeProvider>
        <IntroSequence role="follower" userHandle="alice" travelerName="Traveler" onDone={vi.fn()} />
      </ThemeProvider>,
    );
    expect(document.querySelector("[data-role='intro-sequence']")!).toHaveClass("dark");
  });

  it("intro div gains dark class when Dark button is tapped", () => {
    localStorage.setItem("tripcast.theme_mode", "meadow");
    render(
      <ThemeProvider>
        <IntroSequence role="follower" userHandle="alice" travelerName="Traveler" onDone={vi.fn()} />
      </ThemeProvider>,
    );
    navigateToThemeBeat();
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.querySelector("[data-role='intro-sequence']")!).toHaveClass("dark");
  });

  it("dark class persists when navigating back from theme beat after selecting Dark", () => {
    localStorage.setItem("tripcast.theme_mode", "meadow");
    render(
      <ThemeProvider>
        <IntroSequence role="follower" userHandle="alice" travelerName="Traveler" onDone={vi.fn()} />
      </ThemeProvider>,
    );
    navigateToThemeBeat();
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    fireEvent.click(screen.getByRole("button", { name: /previous intro frame/i }));
    // dark persists across all beats because isDarkPreview = resolvedTheme === "constellation"
    expect(document.querySelector("[data-role='intro-sequence']")!).toHaveClass("dark");
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

  it("splash root renders with dark class when theme is constellation", () => {
    localStorage.setItem("tripcast.theme_mode", "constellation");
    render(
      <ThemeProvider>
        <CreateAccountIntroFlow
          token="session-token"
          role="follower"
          accountLabel="alice"
          userHandle="alice"
          travelerName="Traveler"
          onDone={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(document.querySelector("[data-role='create-account-intro']")!).toHaveClass("dark");
  });
});

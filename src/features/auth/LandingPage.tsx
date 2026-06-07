import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Flag } from "lucide-react";

import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { FeatureShowcase } from "./FeatureShowcase";
import { IntroBackdrop, SceneCard } from "../onboarding/IntroScenes";
import { useTheme } from "../../providers/ThemeProvider";

export interface LandingPageProps {
  onLoginClick: () => void;
}

export default function LandingPage({ onLoginClick }: LandingPageProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "constellation";
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn(
        "min-h-screen font-sans transition-colors duration-500",
        isDark
          ? "bg-[var(--bg-paper)] text-[var(--ink-1)]"
          : "bg-[var(--meadow-bg)] text-[var(--meadow-ink)]",
      )}
    >
      <header
        className={cn(
          "fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b px-4 backdrop-blur-md transition-colors duration-500 sm:px-6",
          isDark
            ? "border-[var(--ink-3)] bg-[var(--bg-paper)]/82"
            : "border-[var(--meadow-paper-edge)] bg-[var(--meadow-bg)]/82",
        )}
      >
        <div className="flex items-center gap-2">
          <BrandCrest size="sm" isDark={isDark} />
          <span className="font-[var(--meadow-font-display)] text-lg font-extrabold">
            TripCast
          </span>
        </div>
        <Button
          onClick={onLoginClick}
          className="h-9 rounded-full px-5 font-[var(--meadow-font-display)] font-bold"
          style={{
            background: isDark ? "var(--flag)" : "var(--meadow-primary)",
            color: isDark ? "white" : "var(--meadow-primary-ink)",
          }}
        >
          Login
        </Button>
      </header>

      <section className="relative overflow-hidden px-4 pb-10 pt-20 sm:px-6">
        <IntroBackdrop
          beat={5}
          isDark={isDark}
          reduceMotion={Boolean(reduceMotion)}
          showStars={isDark}
        />
        <div className="relative z-[1] mx-auto grid max-w-5xl items-center gap-8 md:grid-cols-[0.9fr_1.1fr]">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.5, ease: "easeOut" }}
            className="grid gap-5 text-center md:text-left"
          >
            <div>
              <h1 className="font-[var(--meadow-font-display)] text-4xl font-extrabold leading-[1.08] sm:text-5xl">
                Follow the{" "}
                <span style={{ color: isDark ? "var(--flag)" : "var(--meadow-primary)" }}>
                  Traveler
                </span>
              </h1>
              <p
                className={cn(
                  "mx-auto mt-4 max-w-xl text-base leading-7 md:mx-0",
                  isDark ? "text-[var(--ink-2)]" : "text-[var(--meadow-ink-soft)]",
                )}
              >
                See where they are, read what they share, and help choose what happens next.
              </p>
            </div>
            <div className="flex justify-center md:justify-start">
              <Button
                size="lg"
                onClick={onLoginClick}
                className="h-12 rounded-full px-8 font-[var(--meadow-font-display)] text-base font-extrabold shadow-xl transition-transform hover:scale-[1.03]"
                style={{
                  background: isDark ? "var(--flag)" : "var(--meadow-primary)",
                  color: isDark ? "white" : "var(--meadow-primary-ink)",
                }}
              >
                Enter the Map
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : 0.14, duration: reduceMotion ? 0 : 0.55 }}
            className="mx-auto h-52 w-full max-w-lg sm:h-60 md:h-64"
          >
            <SceneCard beat={5} isDark={isDark} reduceMotion={Boolean(reduceMotion)} />
          </motion.div>
        </div>
      </section>

      <main className="mx-auto grid max-w-5xl gap-14 px-4 pb-12 pt-8 sm:px-6 md:gap-16 md:pt-10">
        <FeatureShowcase isDark={isDark} reduceMotion={reduceMotion} />
      </main>

      <footer
        className={cn(
          "border-t px-4 py-10 text-center transition-colors duration-500 sm:px-6",
          isDark
            ? "border-[var(--ink-3)] bg-[var(--card)]"
            : "border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)]",
        )}
      >
        <div className="mx-auto grid max-w-xl justify-items-center gap-4">
          <BrandCrest isDark={isDark} />
          <h2 className="font-[var(--meadow-font-display)] text-2xl font-extrabold">
            Follow the traveler now
          </h2>
          <Button
            size="lg"
            onClick={onLoginClick}
            className="h-12 rounded-full px-8 font-[var(--meadow-font-display)] text-base font-extrabold shadow-xl"
            style={{
              background: isDark ? "var(--flag)" : "var(--meadow-primary)",
              color: isDark ? "white" : "var(--meadow-primary-ink)",
            }}
          >
            Sign in to TripCast
          </Button>
          <div className="mt-6 font-mono text-[10px] uppercase opacity-40">
            &copy; {new Date().getFullYear()} TripCast
          </div>
        </div>
      </footer>
    </div>
  );
}

function BrandCrest({
  className,
  isDark,
  size = "md",
}: {
  className?: string;
  isDark?: boolean;
  size?: "sm" | "md";
}) {
  const dimensions = size === "sm" ? "h-8 w-8 rounded-lg" : "h-14 w-14 rounded-2xl";
  const iconSize = size === "sm" ? "h-4 w-4" : "h-7 w-7";

  return (
    <span
      className={cn("grid place-items-center text-white shadow-lg", dimensions, className)}
      style={{ background: isDark ? "var(--flag)" : "var(--meadow-primary)" }}
      aria-hidden="true"
    >
      <Flag className={iconSize} strokeWidth={2.5} />
    </span>
  );
}

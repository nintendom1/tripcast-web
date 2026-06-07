import * as React from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import {
  BookOpen,
  Flag,
  MapPin,
  Sparkles,
  Trophy,
  Vote,
  type LucideIcon,
} from "lucide-react";

import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { useTheme } from "../../providers/ThemeProvider";
import { IntroMascot } from "../onboarding/IntroMascot";

interface Feature {
  kicker: string;
  title: string;
  body: string;
  Icon: LucideIcon;
  color: string;
  pose: "idle" | "wave" | "point" | "cheer";
}

const FEATURES: Feature[] = [
  {
    kicker: "The Concept",
    title: "The Road is Calling. Follow the Journey.",
    body: "TripCast turns a traveler's path into a live, interactive story. No algorithms, no noise—just the open road and the people who share it.",
    Icon: Sparkles,
    color: "var(--meadow-primary)",
    pose: "wave",
  },
  {
    kicker: "Stories",
    title: "Moments Worth Keeping.",
    body: "View the trip through the traveler's eyes. Every pin on the map is a postcard, a memory, and a piece of the journey you can revisit anytime.",
    Icon: BookOpen,
    color: "var(--meadow-royal)",
    pose: "point",
  },
  {
    kicker: "Missions",
    title: "Don't Just Watch. Participate.",
    body: "Suggest detours, food stops, or local gems. Your ideas become missions that the traveler can accept and complete in the real world.",
    Icon: MapPin,
    color: "var(--teal)",
    pose: "cheer",
  },
  {
    kicker: "Votes",
    title: "Decide Together.",
    body: "When the road forks, the audience weighs in. Cast your vote to help the traveler choose the next chapter in real-time.",
    Icon: Vote,
    color: "var(--meadow-primary)",
    pose: "point",
  },
  {
    kicker: "Legacy",
    title: "Your Influence, Recorded.",
    body: "Earn badges and recognition for your contributions. Be more than a follower; be a part of the journey's living history.",
    Icon: Trophy,
    color: "var(--meadow-gold)",
    pose: "cheer",
  },
];

export interface LandingPageProps {
  onLoginClick: () => void;
}

export default function LandingPage({ onLoginClick }: LandingPageProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "constellation";
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <div className={cn(
      "min-h-screen font-sans transition-colors duration-500",
      isDark ? "bg-[var(--bg-paper)] text-[var(--ink-1)]" : "bg-[var(--meadow-bg)] text-[var(--meadow-ink)]"
    )}>
      {/* Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1.5 z-50 origin-left"
        style={{
          scaleX,
          background: isDark ? "var(--flag)" : "var(--meadow-primary)"
        }}
      />

      {/* Header */}
      <header className={cn(
        "fixed top-0 left-0 right-0 z-40 h-16 border-b backdrop-blur-md flex items-center justify-between px-6 transition-colors duration-500",
        isDark ? "bg-[var(--bg-paper)]/80 border-[var(--ink-3)]" : "bg-[var(--meadow-bg)]/80 border-[var(--meadow-paper-edge)]"
      )}>
        <div className="flex items-center gap-2">
          <BrandCrest size="sm" isDark={isDark} />
          <span className="font-[var(--meadow-font-display)] text-xl font-extrabold tracking-tight">
            TripCast
          </span>
        </div>
        <Button
          onClick={onLoginClick}
          className="rounded-full px-6 font-[var(--meadow-font-display)] font-bold"
          style={{
            background: isDark ? "var(--flag)" : "var(--meadow-primary)",
            color: isDark ? "white" : "var(--meadow-primary-ink)",
          }}
        >
          Login
        </Button>
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden flex flex-col items-center text-center">
        <IntroBackdrop isDark={isDark} />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 max-w-2xl"
        >
          <div className={cn(
            "mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-[var(--meadow-font-display)] text-xs font-extrabold uppercase tracking-widest",
            isDark ? "border-[var(--ink-3)] bg-[var(--card)] text-[var(--ink-2)]" : "border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)] text-[var(--meadow-ink-soft)]"
          )}>
            <Sparkles className="h-3.5 w-3.5" style={{ color: isDark ? "var(--flag)" : "var(--meadow-primary)" }} />
            The Future of Travel
          </div>
          <h1 className="font-[var(--meadow-font-display)] text-5xl md:text-6xl font-extrabold leading-[1.1] mb-6">
            Real Trips. <br />
            <span style={{ color: isDark ? "var(--flag)" : "var(--meadow-primary)" }}>Real People.</span> <br />
            Real Connection.
          </h1>
          <p className={cn(
            "text-lg md:text-xl mb-10 leading-relaxed",
            isDark ? "text-[var(--ink-2)]" : "text-[var(--meadow-ink-soft)]"
          )}>
            Follow the road as it happens. TripCast is a live narrative platform where the audience helps shape the journey.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              onClick={onLoginClick}
              className="rounded-full px-10 h-14 text-lg font-[var(--meadow-font-display)] font-extrabold shadow-xl hover:scale-105 transition-transform"
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
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="mt-16 relative z-10"
        >
          <div className="relative group">
            <div className={cn(
              "absolute -inset-1 rounded-[32px] blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200",
              isDark ? "bg-[var(--flag)]" : "bg-[var(--meadow-primary)]"
            )} />
            <div className={cn(
              "relative h-64 w-64 md:h-80 md:w-80 rounded-[30px] border-4 flex items-center justify-center overflow-hidden shadow-2xl",
              isDark ? "bg-[var(--card)] border-[var(--ink-3)]" : "bg-[var(--meadow-paper)] border-white"
            )}>
              <IntroMascot pose="wave" size={8} />
            </div>
          </div>
        </motion.div>
      </section>

      {/* Feature Sections */}
      <div className="max-w-5xl mx-auto px-6 py-20 space-y-40">
        {FEATURES.map((feature, idx) => (
          <FeatureSection key={idx} feature={feature} index={idx} isDark={isDark} />
        ))}
      </div>

      {/* Footer */}
      <footer className={cn(
        "py-20 px-6 text-center border-t transition-colors duration-500",
        isDark ? "bg-[var(--card)] border-[var(--ink-3)]" : "bg-[var(--meadow-paper)] border-[var(--meadow-paper-edge)]"
      )}>
        <div className="max-w-2xl mx-auto">
          <BrandCrest className="mx-auto mb-6" isDark={isDark} />
          <h2 className="font-[var(--meadow-font-display)] text-3xl font-extrabold mb-4">
            Ready to hit the road?
          </h2>
          <p className={cn(
            "mb-8",
            isDark ? "text-[var(--ink-2)]" : "text-[var(--meadow-ink-soft)]"
          )}>
            Join the journey and see where the road leads today.
          </p>
          <Button
            size="lg"
            onClick={onLoginClick}
            className="rounded-full px-10 h-14 text-lg font-[var(--meadow-font-display)] font-extrabold shadow-xl"
            style={{
              background: isDark ? "var(--flag)" : "var(--meadow-primary)",
              color: isDark ? "white" : "var(--meadow-primary-ink)",
            }}
          >
            Sign in to TripCast
          </Button>
          <div className="mt-16 text-[10px] font-mono uppercase tracking-[0.2em] opacity-40">
            &copy; {new Date().getFullYear()} TripCast &bull; Built for the journey
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureSection({ feature, index, isDark }: { feature: Feature, index: number, isDark: boolean }) {
  const isEven = index % 2 === 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={cn(
        "flex flex-col md:flex-row items-center gap-12 md:gap-20",
        isEven ? "md:flex-row" : "md:flex-row-reverse"
      )}
    >
      <div className="flex-1 text-center md:text-left">
        <div className={cn(
          "mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 font-[var(--meadow-font-display)] text-[10px] font-extrabold uppercase tracking-widest",
          isDark ? "bg-[var(--ink-3)] text-[var(--ink-2)]" : "bg-[var(--meadow-paper-edge)] text-[var(--meadow-ink-soft)]"
        )}>
          <feature.Icon className="h-3 w-3" style={{ color: isDark ? "var(--flag)" : "var(--meadow-primary)" }} />
          {feature.kicker}
        </div>
        <h3 className="font-[var(--meadow-font-display)] text-3xl md:text-4xl font-extrabold mb-4 leading-tight">
          {feature.title}
        </h3>
        <p className={cn(
          "text-lg leading-relaxed",
          isDark ? "text-[var(--ink-2)]" : "text-[var(--meadow-ink-soft)]"
        )}>
          {feature.body}
        </p>
      </div>
      <div className="flex-1 flex justify-center">
        <motion.div
          whileHover={{ scale: 1.05 }}
          className={cn(
            "h-64 w-64 md:h-72 md:w-72 rounded-[40px] shadow-2xl flex items-center justify-center relative transition-colors duration-500",
            isDark ? "bg-[var(--card)] border border-[var(--ink-3)]" : "bg-[var(--meadow-paper)] border-4 border-white"
          )}
        >
          <IntroMascot pose={feature.pose} size={6} />
        </motion.div>
      </div>
    </motion.section>
  );
}

function BrandCrest({ className, isDark, size = "md" }: { className?: string; isDark?: boolean, size?: "sm" | "md" }) {
  const dimensions = size === "sm" ? "h-8 w-8 rounded-lg" : "h-16 w-16 rounded-2xl";
  const iconSize = size === "sm" ? "h-4 w-4" : "h-8 w-8";

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

function IntroBackdrop({ isDark }: { isDark?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Light radial — fades out when isDark */}
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-1000",
          isDark ? "opacity-0" : "opacity-100"
        )}
        style={{ background: "radial-gradient(circle at 50% 35%, var(--meadow-paper) 0%, var(--meadow-bg) 66%)" }}
      />

      {/* Dark radial — fades in when isDark */}
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-1000",
          isDark ? "opacity-100" : "opacity-0"
        )}
        style={{ background: "radial-gradient(circle at 50% 35%, #242746 0%, #1c1f3a 66%)" }}
      />

      {/* Sun / Moon */}
      <motion.div
        className={cn(
          "absolute -right-20 -top-20 h-64 w-64 rounded-full transition-colors duration-1000 blur-3xl",
          isDark ? "bg-slate-200/5" : "bg-[var(--meadow-gold)]/10"
        )}
        animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

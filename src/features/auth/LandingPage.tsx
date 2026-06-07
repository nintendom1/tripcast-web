import * as React from "react";
import { motion, useScroll, useSpring } from "framer-motion";
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

interface Feature {
  kicker: string;
  title: string;
  body: string;
  Icon: LucideIcon;
  beat: number;
}

const FEATURES: Feature[] = [
  {
    kicker: "The Concept",
    title: "Watch the Journey Unfold.",
    body: "Follow the traveler's path in real-time. See where they are, where they've been, and what they're seeing right now.",
    Icon: Sparkles,
    beat: 0,
  },
  {
    kicker: "Stories",
    title: "Postcards from the Traveler.",
    body: "Read the notes and see the photos pinned to the map. Every story is a window into the traveler's experience.",
    Icon: BookOpen,
    beat: 1,
  },
  {
    kicker: "Missions",
    title: "Suggest a Path.",
    body: "Drop an idea for the traveler to chase. Your suggestions become missions they can accept and complete.",
    Icon: MapPin,
    beat: 2,
  },
  {
    kicker: "Votes",
    title: "Help Them Choose.",
    body: "When the traveler reaches a fork, weigh in. Your vote helps decide which way they go next.",
    Icon: Vote,
    beat: 3,
  },
  {
    kicker: "Badges",
    title: "Be Part of the Story.",
    body: "Earn credit and badges for your contributions. Your influence is recorded as part of the trip's history.",
    Icon: Trophy,
    beat: 4,
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
      <section className="relative pt-24 pb-12 px-6 overflow-hidden flex flex-col items-center text-center">
        <IntroBackdrop isDark={isDark} />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 max-w-2xl"
        >
          <h1 className="font-[var(--meadow-font-display)] text-5xl md:text-6xl font-extrabold leading-[1.1] mb-6">
            Follow the <br />
            <span style={{ color: isDark ? "var(--flag)" : "var(--meadow-primary)" }}>Traveler.</span>
          </h1>
          <p className={cn(
            "text-lg md:text-xl mb-8 leading-relaxed max-w-lg mx-auto",
            isDark ? "text-[var(--ink-2)]" : "text-[var(--meadow-ink-soft)]"
          )}>
            See where they go, help them choose, and be part of every mile.
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
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="mt-12 relative z-10 w-full max-w-sm h-48"
        >
          <SceneCard beat={5} isDark={isDark} />
        </motion.div>
      </section>

      {/* Feature Sections */}
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-24">
        {FEATURES.map((feature, idx) => (
          <FeatureSection key={idx} feature={feature} index={idx} isDark={isDark} />
        ))}
      </div>

      {/* Footer */}
      <footer className={cn(
        "py-16 px-6 text-center border-t transition-colors duration-500",
        isDark ? "bg-[var(--card)] border-[var(--ink-3)]" : "bg-[var(--meadow-paper)] border-[var(--meadow-paper-edge)]"
      )}>
        <div className="max-w-2xl mx-auto">
          <BrandCrest className="mx-auto mb-6" isDark={isDark} />
          <h2 className="font-[var(--meadow-font-display)] text-3xl font-extrabold mb-4">
            Follow the journey
          </h2>
          <p className={cn(
            "mb-8",
            isDark ? "text-[var(--ink-2)]" : "text-[var(--meadow-ink-soft)]"
          )}>
            Sign in to see where the traveler is right now.
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
            &copy; {new Date().getFullYear()} TripCast
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
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn(
        "flex flex-col md:flex-row items-center gap-8 md:gap-16",
        isEven ? "md:flex-row" : "md:flex-row-reverse"
      )}
    >
      <div className="flex-1 text-center md:text-left">
        <div className={cn(
          "mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 font-[var(--meadow-font-display)] text-[10px] font-extrabold uppercase tracking-widest",
          isDark ? "bg-[var(--ink-3)] text-[var(--ink-2)]" : "bg-[var(--meadow-paper-edge)] text-[var(--meadow-ink-soft)]"
        )}>
          <feature.Icon className="h-3 w-3" style={{ color: isDark ? "var(--flag)" : "var(--meadow-primary)" }} />
          {feature.kicker}
        </div>
        <h3 className="font-[var(--meadow-font-display)] text-2xl md:text-3xl font-extrabold mb-3 leading-tight">
          {feature.title}
        </h3>
        <p className={cn(
          "text-base md:text-lg leading-relaxed",
          isDark ? "text-[var(--ink-2)]" : "text-[var(--meadow-ink-soft)]"
        )}>
          {feature.body}
        </p>
      </div>
      <div className="flex-1 w-full max-w-sm h-32">
        <SceneCard beat={feature.beat} isDark={isDark} />
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
    </div>
  );
}

/* Duplicated SceneCard and MapPreviewCard logic from IntroSequence.tsx for zero-dependency consistency in LandingPage */

function SceneCard({ beat, isDark }: { beat: number; isDark?: boolean }) {
  if (beat === 1) {
    return (
      <div className="grid h-full grid-cols-3 items-center gap-2">
        {["-rotate-3", "rotate-1", "rotate-3"].map((classes, index) => (
          <motion.div
            key={classes}
            initial={{ opacity: 0, y: 24, rotate: 0 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.14, duration: 0.45, ease: "easeOut" }}
            className={cn(
              "h-24 rounded-md border p-2 shadow-[var(--shadow-card)]",
              isDark
                ? "border-[var(--ink-3)] bg-[var(--card)]"
                : "border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)]",
              classes,
            )}
          >
            <div className={cn("h-10 rounded", isDark ? "bg-[var(--flag)]/20" : "bg-[var(--meadow-royal)]/20")} />
            <div className={cn("mt-2 h-2 w-20 rounded", isDark ? "bg-[var(--flag)]/50" : "bg-[var(--meadow-primary)]/50")} />
            <div className={cn("mt-1 h-2 w-14 rounded", isDark ? "bg-[var(--ink-3)]/40" : "bg-[var(--meadow-ink-very)]/40")} />
          </motion.div>
        ))}
      </div>
    );
  }

  if (beat === 2) {
    return (
      <div
        className={cn(
          "relative h-full overflow-hidden rounded-[26px] border shadow-[var(--shadow-card)]",
          isDark ? "border-[#2d314d] bg-[#1c1f3a]" : "border-[var(--meadow-paper-edge)] bg-[#eaf2da]",
        )}
      >
        <div
          className="absolute inset-0 opacity-80"
          style={{
            backgroundImage: isDark
              ? "linear-gradient(135deg, transparent 0 42%, #24273a 42% 50%, transparent 50%), linear-gradient(35deg, transparent 0 55%, #24273a 55% 68%, transparent 68%)"
              : "linear-gradient(135deg, transparent 0 42%, #bcd58a 42% 50%, transparent 50%), linear-gradient(35deg, transparent 0 55%, #b3def0 55% 68%, transparent 68%)",
          }}
        />
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.25, duration: 0.55, ease: "easeOut" }}
          className="absolute left-[62%] top-[35%] text-[#e53935]"
        >
          <MapPin className="h-10 w-10 fill-current" />
        </motion.div>
      </div>
    );
  }

  if (beat === 3) {
    return (
      <div className="grid h-full grid-cols-2 items-center gap-3">
        {["Food crawl", "Ferry ride"].map((label, index) => (
          <motion.div
            key={label}
            initial={{ y: 16, opacity: 0 }}
            whileInView={{ y: index === 1 ? -12 : 0, opacity: index === 0 ? 0.65 : 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 + index * 0.12, duration: 0.45, ease: "easeOut" }}
            className={cn(
              "rounded-2xl border p-3 text-left shadow-[var(--shadow-card)]",
              isDark
                ? cn("bg-[var(--card)]", index === 1 ? "border-[var(--teal)]" : "border-[var(--ink-3)]")
                : cn("bg-[var(--meadow-paper)]", index === 1 ? "border-[var(--meadow-royal)]" : "border-[var(--meadow-paper-edge)]"),
            )}
          >
            <div className={cn("font-[var(--meadow-font-display)] text-sm font-extrabold", isDark ? "text-[var(--ink-1)]" : "text-[var(--meadow-ink)]")}>{label}</div>
            <div className={cn("mt-3 h-2 overflow-hidden rounded", isDark ? "bg-[var(--teal)]/20" : "bg-[var(--meadow-royal)]/20")}>
              <div className={cn("h-full rounded", isDark ? "bg-[var(--teal)]" : "bg-[var(--meadow-royal)]")} style={{ width: index === 1 ? "68%" : "32%" }} />
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  if (beat === 4) {
    return (
      <motion.div
        initial={{ rotateY: 180, scale: 0.4, opacity: 0 }}
        whileInView={{ rotateY: 0, scale: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className={cn(
          "mx-auto grid h-28 w-28 place-items-center rounded-full border-4 shadow-[0_14px_32px_rgba(255,184,74,0.45)]",
          isDark
            ? "border-[var(--card)] bg-[var(--amber)] text-[var(--ink-on-dark)]"
            : "border-white bg-[var(--meadow-gold)] text-[var(--meadow-ink)]",
        )}
      >
        <Trophy className="h-12 w-12" aria-hidden />
      </motion.div>
    );
  }

  if (beat === 5) {
    return <MapPreviewCard isDark={isDark} />;
  }

  return (
    <div className={cn("mx-auto w-fit rounded-full p-5 shadow-[var(--shadow-card)]", isDark ? "bg-[var(--card)]" : "bg-[var(--meadow-paper)]")}>
      <Sparkles className={cn("h-16 w-16", isDark ? "text-[var(--flag)]" : "text-[var(--meadow-primary)]")} aria-hidden />
    </div>
  );
}

function MapPreviewCard({ isDark }: { isDark?: boolean }) {
  const maskId = React.useId();
  const roadMajor = isDark ? "#3c4060" : "#ffffff";
  const roadMinor = isDark ? "#333758" : "#ede8d8";
  const building = isDark ? "#35385a" : "#e0d8c4";
  const pinFill = "#e53935";

  return (
    <div
      className={cn(
        "relative h-full overflow-hidden rounded-[26px] border shadow-[var(--shadow-card)] transition-colors duration-500",
        isDark ? "border-[#2d314d]" : "border-[var(--meadow-paper-edge)]"
      )}
      style={{ background: "var(--map-water)" }}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 25 100 50" preserveAspectRatio="xMidYMid meet">
        <rect x="0" y="0" width="100" height="100" fill="var(--map-water)" />
        <path
          d="M 42 0 L 100 0 L 100 100 L 52 100 Q 36 95 28 80 Q 18 62 24 44 Q 30 26 38 12 Q 40 5 42 0 Z"
          fill="var(--map-land)"
        />
        <path
          d="M 26 46 Q 15 54 20 67 Q 24 76 30 81"
          fill="none"
          stroke="var(--map-water)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M 40 66 Q 52 59 64 63 Q 74 67 70 81 Q 64 91 48 89 Q 36 86 38 75 Z"
          fill="var(--map-park)"
        />
        <path d="M 100 40 Q 80 44 65 47 Q 48 51 34 49" fill="none" stroke={roadMinor} strokeWidth="1.2" />
        <path d="M 66 0 Q 60 28 54 52 Q 50 68 52 100" fill="none" stroke={roadMajor} strokeWidth="2.5" />
        <rect x="72" y="37" width="6" height="4" rx="0.5" fill={building} />
        <rect x="80" y="34" width="5" height="6" rx="0.5" fill={building} />
        <rect x="74" y="43" width="4" height="4" rx="0.5" fill={building} />
        <rect x="80" y="43" width="6" height="3" rx="0.5" fill={building} />
        <defs>
          <mask id={maskId}>
            <motion.path
              d="M 38 64 L 75 40"
              stroke="white"
              strokeWidth="6"
              fill="none"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 0.8, ease: "easeOut" }}
            />
          </mask>
        </defs>
        <path
          d="M 38 64 L 75 40"
          fill="none"
          stroke={isDark ? "#ffd86a" : "#444444"}
          strokeWidth="2.5"
          strokeDasharray="5 3"
          mask={`url(#${maskId})`}
        />
        <g fill={pinFill}>
          <circle cx="38" cy="57.5" r="4.5" />
          <polygon points="38,64 34.5,59 41.5,59" />
        </g>
        <circle cx="38" cy="57.5" r="1.8" fill="white" />
        <g fill={pinFill}>
          <circle cx="75" cy="33.5" r="4.5" />
          <polygon points="75,40 71.5,35 78.5,35" />
        </g>
        <circle cx="75" cy="33.5" r="1.8" fill="white" />
      </svg>
    </div>
  );
}

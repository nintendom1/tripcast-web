import * as React from "react";
import { motion, useInView } from "framer-motion";
import { BookOpen, MapPin, Trophy, Vote, type LucideIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { SceneCard } from "../onboarding/IntroScenes";

interface Feature {
  kicker: string;
  title: string;
  body: string;
  Icon: LucideIcon;
  beat: number;
}

export const TRIPCAST_FEATURES: Feature[] = [
  {
    kicker: "Stories",
    title: "Read what they post from each stop.",
    body: "Notes and photos sit on the map so the trip is easy to follow as it unfolds.",
    Icon: BookOpen,
    beat: 1,
  },
  {
    kicker: "Missions",
    title: "Suggest something for the traveler to try.",
    body: "Drop a food stop, place, or detour. The traveler can accept it when it fits the day.",
    Icon: MapPin,
    beat: 2,
  },
  {
    kicker: "Votes",
    title: "Help choose between good options.",
    body: "When the traveler asks for input, followers can vote quickly and keep the plan moving.",
    Icon: Vote,
    beat: 3,
  },
  {
    kicker: "Badges",
    title: "See who helped shape the trip.",
    body: "Points and badges give followers credit when their suggestions and votes land.",
    Icon: Trophy,
    beat: 4,
  },
];

export function FeatureShowcase({
  isDark,
  reduceMotion,
  className,
}: {
  isDark: boolean;
  reduceMotion: boolean | null;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-14 md:gap-16", className)}>
      {TRIPCAST_FEATURES.map((feature, index) => (
        <FeatureSection
          key={feature.kicker}
          feature={feature}
          index={index}
          isDark={isDark}
          reduceMotion={reduceMotion}
        />
      ))}
    </div>
  );
}

function FeatureSection({
  feature,
  index,
  isDark,
  reduceMotion,
}: {
  feature: Feature;
  index: number;
  isDark: boolean;
  reduceMotion: boolean | null;
}) {
  const sectionRef = React.useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.58 });
  const isEven = index % 2 === 0;
  const active = reduceMotion || isInView;

  return (
    <motion.section
      ref={sectionRef}
      initial={reduceMotion ? false : { opacity: 0, y: 28 }}
      animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
      transition={{ duration: reduceMotion ? 0 : 0.5, ease: "easeOut" }}
      className={cn(
        "grid items-center gap-5 md:grid-cols-2 md:gap-10",
        !isEven && "md:[&>*:first-child]:order-2",
      )}
    >
      <div className="grid gap-3 text-center md:text-left">
        <div
          className={cn(
            "inline-flex w-fit items-center gap-2 justify-self-center rounded-full px-3 py-1 font-[var(--meadow-font-display)] text-[10px] font-extrabold uppercase md:justify-self-start",
            isDark
              ? "bg-[var(--ink-3)] text-[var(--ink-2)]"
              : "bg-[var(--meadow-paper-edge)] text-[var(--meadow-ink-soft)]",
          )}
        >
          <feature.Icon
            className="h-3 w-3"
            style={{ color: isDark ? "var(--flag)" : "var(--meadow-primary)" }}
            aria-hidden
          />
          {feature.kicker}
        </div>
        <h3 className="font-[var(--meadow-font-display)] text-2xl font-extrabold leading-tight md:text-3xl">
          {feature.title}
        </h3>
        <p
          className={cn(
            "text-base leading-7",
            isDark ? "text-[var(--ink-2)]" : "text-[var(--meadow-ink-soft)]",
          )}
        >
          {feature.body}
        </p>
      </div>
      <div className="h-36 w-full md:h-40">
        <SceneCard
          beat={feature.beat}
          isDark={isDark}
          isActive={Boolean(active)}
          reduceMotion={Boolean(reduceMotion)}
        />
      </div>
    </motion.section>
  );
}

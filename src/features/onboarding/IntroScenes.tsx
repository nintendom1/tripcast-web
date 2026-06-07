import * as React from "react";
import { motion } from "framer-motion";
import { Bed, Footprints, Hamburger, MapPin, Sparkles, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";

export function IntroBackdrop({
  beat,
  isDark,
  isThemeBeat = false,
  reduceMotion = false,
  showStars = false,
}: {
  beat: number;
  isDark?: boolean;
  isThemeBeat?: boolean;
  reduceMotion?: boolean;
  showStars?: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-1000",
          isDark ? "opacity-0" : "opacity-100",
        )}
        style={{
          background:
            "radial-gradient(circle at 50% 35%, var(--meadow-paper) 0%, var(--meadow-bg) 66%)",
        }}
      />

      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-1000",
          isDark ? "opacity-100" : "opacity-0",
        )}
        style={{ background: "radial-gradient(circle at 50% 35%, #242746 0%, #1c1f3a 66%)" }}
      />

      {/* Night starfield sits behind the sun/moon disc and meadow foreground. */}
      {(isThemeBeat || showStars) && isDark && (
        <motion.div
          data-intro-stars
          className="absolute inset-0 z-[1]"
          animate={reduceMotion ? { opacity: 0.08 } : { opacity: [0.04, 0.14, 0.04] }}
          transition={{
            duration: reduceMotion ? 0 : 4,
            repeat: reduceMotion ? 0 : Infinity,
            ease: "easeInOut",
          }}
          style={{
            backgroundImage: [
              "radial-gradient(circle, #ffd86a 1px, transparent 1px)",
              "radial-gradient(circle, #ffd86a 1px, transparent 1px)",
              "radial-gradient(circle, #ffd86a 1.5px, transparent 1.5px)",
              "radial-gradient(circle, #ffd86a 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "120px 80px, 90px 110px, 150px 70px, 80px 130px",
            backgroundPosition: "20px 15px, 60px 45px, 10px 70px, 80px 10px",
          }}
        />
      )}

      {/* Sun/moon disc shared by the intro sequence and landing hero. */}
      <motion.div
        data-intro-sun-moon
        className={cn(
          "absolute right-10 top-16 z-[2] h-24 w-24 rounded-full transition-colors duration-1000",
          isDark ? "bg-[#3b3f61]" : "bg-[var(--meadow-gold)]/40",
        )}
        animate={
          reduceMotion
            ? { scale: 1, opacity: 1 }
            : isDark
              ? { scale: beat % 2 === 0 ? 1 : 1.08, opacity: 1 }
              : { scale: beat % 2 === 0 ? 1 : 1.08, opacity: [0.45, 0.7, 0.45] }
        }
        transition={{ duration: reduceMotion ? 0 : 3, repeat: reduceMotion ? 0 : Infinity, ease: "easeInOut" }}
      />

      <div
        className={cn(
          "absolute left-8 top-32 z-[2] h-10 w-28 rounded-full bg-white/65 transition-opacity duration-700",
          isDark ? "opacity-0" : "opacity-100",
        )}
      />
      <div
        className={cn(
          "absolute right-16 top-44 z-[2] h-8 w-24 rounded-full bg-white/55 transition-opacity duration-700",
          isDark ? "opacity-0" : "opacity-100",
        )}
      />

      {/* Meadow/ground haze at the bottom of non-theme scenes; opaque at night so it covers stars. */}
      {!isThemeBeat && (
        <div
          data-intro-meadow
          className={cn(
            "absolute -bottom-16 left-1/2 z-[2] h-48 w-[120%] -translate-x-1/2 rounded-[50%]",
            isDark ? "bg-[#222744]" : "bg-[var(--meadow-forest)]/10",
          )}
        />
      )}

      {isThemeBeat && (
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      )}
    </div>
  );
}

export function SceneCard({
  beat,
  isDark,
  isActive = true,
  reduceMotion = false,
}: {
  beat: number;
  isDark?: boolean;
  isActive?: boolean;
  reduceMotion?: boolean;
}) {
  const active = isActive || reduceMotion;

  if (beat === 1) {
    return (
      <div className="grid h-full grid-cols-3 items-center gap-2">
        {["-rotate-3", "rotate-1", "rotate-3"].map((classes, index) => (
          <motion.div
            key={classes}
            initial={reduceMotion ? false : { opacity: 0, y: 24, rotate: 0 }}
            animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 24, rotate: 0 }}
            transition={{
              delay: reduceMotion ? 0 : index * 0.14,
              duration: reduceMotion ? 0 : 0.45,
              ease: "easeOut",
            }}
            className={cn(
              "h-24 rounded-md border p-2 shadow-[var(--shadow-card)]",
              isDark
                ? "border-[var(--ink-3)] bg-[var(--card)]"
                : "border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)]",
              classes,
            )}
          >
            <div
              className={cn(
                "h-10 rounded",
                isDark ? "bg-[var(--flag)]/20" : "bg-[var(--meadow-royal)]/20",
              )}
            />
            <div
              className={cn(
                "mt-2 h-2 w-20 rounded",
                isDark ? "bg-[var(--flag)]/50" : "bg-[var(--meadow-primary)]/50",
              )}
            />
            <div
              className={cn(
                "mt-1 h-2 w-14 rounded",
                isDark ? "bg-[var(--ink-3)]/40" : "bg-[var(--meadow-ink-very)]/40",
              )}
            />
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
          isDark
            ? "border-[#2d314d] bg-[#1c1f3a]"
            : "border-[var(--meadow-paper-edge)] bg-[#eaf2da]",
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
          initial={reduceMotion ? false : { y: -80, opacity: 0 }}
          animate={active ? { y: 0, opacity: 1 } : { y: -80, opacity: 0 }}
          transition={{
            delay: reduceMotion ? 0 : 0.25,
            duration: reduceMotion ? 0 : 0.55,
            ease: "easeOut",
          }}
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
            initial={reduceMotion ? false : { y: 16, opacity: 0 }}
            animate={
              active
                ? { y: index === 1 ? -12 : 0, opacity: index === 0 ? 0.65 : 1 }
                : { y: 16, opacity: 0 }
            }
            transition={{
              delay: reduceMotion ? 0 : 0.15 + index * 0.12,
              duration: reduceMotion ? 0 : 0.45,
              ease: "easeOut",
            }}
            className={cn(
              "rounded-2xl border p-3 text-left shadow-[var(--shadow-card)]",
              isDark
                ? cn(
                    "bg-[var(--card)]",
                    index === 1 ? "border-[var(--teal)]" : "border-[var(--ink-3)]",
                  )
                : cn(
                    "bg-[var(--meadow-paper)]",
                    index === 1
                      ? "border-[var(--meadow-royal)]"
                      : "border-[var(--meadow-paper-edge)]",
                  ),
            )}
          >
            <div
              className={cn(
                "font-[var(--meadow-font-display)] text-sm font-extrabold",
                isDark ? "text-[var(--ink-1)]" : "text-[var(--meadow-ink)]",
              )}
            >
              {label}
            </div>
            <div
              className={cn(
                "mt-3 h-2 overflow-hidden rounded",
                isDark ? "bg-[var(--teal)]/20" : "bg-[var(--meadow-royal)]/20",
              )}
            >
              <div
                className={cn(
                  "h-full rounded",
                  isDark ? "bg-[var(--teal)]" : "bg-[var(--meadow-royal)]",
                )}
                style={{ width: index === 1 ? "68%" : "32%" }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  if (beat === 4) {
    return (
      <motion.div
        initial={reduceMotion ? false : { rotateY: 180, scale: 0.4, opacity: 0 }}
        animate={
          active ? { rotateY: 0, scale: 1, opacity: 1 } : { rotateY: 180, scale: 0.4, opacity: 0 }
        }
        transition={{ duration: reduceMotion ? 0 : 0.7, ease: "easeOut" }}
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
    return <MapPreviewCard isDark={isDark} isActive={active} reduceMotion={reduceMotion} />;
  }

  if (beat === 6) {
    const meters = [
      { label: "Energy", color: "var(--amber)", loop: ["62%", "84%", "62%"], still: "72%" },
      { label: "Fullness", color: "var(--green)", loop: ["38%", "58%", "38%"], still: "45%" },
      { label: "Calm", color: "var(--teal)", loop: ["70%", "90%", "70%"], still: "80%" },
    ];
    const looping = active && !reduceMotion;
    return (
      <div className="flex h-full flex-col justify-center gap-2.5">
        {meters.map((meter, index) => (
          <div key={meter.label} className="flex flex-col gap-1">
            <span
              className={cn(
                "font-[var(--font-mono)] text-[9px] font-bold uppercase leading-none tracking-[0.08em]",
                isDark ? "text-[var(--ink-3)]" : "text-[var(--meadow-ink-soft)]",
              )}
            >
              {meter.label}
            </span>
            <div
              className={cn(
                "h-2 overflow-hidden rounded-full",
                isDark ? "bg-[var(--ink-3)]/30" : "bg-[var(--meadow-paper-edge)]",
              )}
            >
              <motion.span
                className="block h-full rounded-full"
                style={{ background: meter.color }}
                initial={reduceMotion ? false : { width: meter.loop[0] }}
                animate={looping ? { width: meter.loop } : { width: meter.still }}
                transition={
                  looping
                    ? {
                        duration: 3 + index * 0.6,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: index * 0.6,
                      }
                    : { duration: 0 }
                }
              />
            </div>
          </div>
        ))}
        <div className="mt-1.5 flex items-center justify-center gap-3">
          {[Footprints, Hamburger, Footprints, Bed, Footprints].map((Icon, step) => (
            <motion.span
              key={step}
              className={cn(
                isDark ? "text-[var(--ink-3)]" : "text-[var(--meadow-ink-soft)]",
                step % 2 === 1 && "translate-y-1",
              )}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={looping ? { opacity: [0, 1, 1, 0] } : { opacity: 0.5 }}
              transition={
                looping
                  ? {
                      duration: 3.5,
                      times: [0, 0.2, 0.7, 1],
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: step * 0.4,
                    }
                  : { duration: 0 }
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
            </motion.span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mx-auto w-fit rounded-full p-5 shadow-[var(--shadow-card)]",
        isDark ? "bg-[var(--card)]" : "bg-[var(--meadow-paper)]",
      )}
    >
      <Sparkles
        className={cn("h-16 w-16", isDark ? "text-[var(--flag)]" : "text-[var(--meadow-primary)]")}
        aria-hidden
      />
    </div>
  );
}

function MapPreviewCard({
  isDark,
  isActive,
  reduceMotion,
}: {
  isDark?: boolean;
  isActive: boolean;
  reduceMotion: boolean;
}) {
  const maskId = React.useId();
  const roadMajor = isDark ? "#3c4060" : "#ffffff";
  const roadMinor = isDark ? "#333758" : "#ede8d8";
  const building = isDark ? "#35385a" : "#e0d8c4";
  const pinFill = "#e53935";

  return (
    <div
      className={cn(
        "relative h-full overflow-hidden rounded-[26px] border shadow-[var(--shadow-card)] transition-colors duration-500",
        isDark ? "border-[#2d314d]" : "border-[var(--meadow-paper-edge)]",
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
          strokeLinecap="round"
          strokeWidth="8"
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
              initial={reduceMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: isActive ? 1 : 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : isActive
                    ? { duration: 2, repeat: Infinity, repeatDelay: 0.8, ease: "easeOut" }
                    : { duration: 0.2, ease: "easeOut" }
              }
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

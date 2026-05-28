import * as React from "react";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  Flag,
  MapPin,
  Moon,
  Sparkles,
  Sun,
  Trophy,
  Vote,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "../../components/ui/button";
import { tripcastApi, type Role } from "../../convex/tripcastApi";
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { cn } from "@/lib/utils";
import { MusicMuteIndicator } from "../hud/MusicMuteIndicator";
import { useMusicSafe } from "../../providers/MusicProvider";
import { IntroMascot } from "./IntroMascot";
import { useTheme, type ThemeMode } from "../../providers/ThemeProvider";

const INTRO_STORAGE_PREFIX = "tripcast.introSeen.v1";

type IntroDoneReason = "done" | "skip";

type IntroSequenceProps = {
  role: Role;
  accountLabel?: string;
  userHandle?: string;
  travelerName?: string;
  source?: "account-create" | "options-replay";
  onDone: (reason: IntroDoneReason) => void;
};

type Beat = {
  kicker: string;
  title: string;
  body: string;
  cta: string;
  Icon: LucideIcon;
};

const BEATS: Beat[] = [
  {
    kicker: "Welcome",
    title: "Watch, shape, and share the trip.",
    body: "You are invited into the road journal, the decisions, and the little wins along the way.",
    cta: "Next",
    Icon: Sparkles,
  },
  {
    kicker: "Stories",
    title: "Read the postcards from the road.",
    body: "Stories collect the moments worth keeping, with pins and notes you can revisit later.",
    cta: "Next",
    Icon: BookOpen,
  },
  {
    kicker: "Missions",
    title: "Suggest places, food, and detours.",
    body: "Drop an idea for the Traveler to accept, start, complete, or save for later.",
    cta: "Next",
    Icon: MapPin,
  },
  {
    kicker: "Votes",
    title: "Help choose when the road forks.",
    body: "A quick tap can push a plan forward when there are a few good options.",
    cta: "Next",
    Icon: Vote,
  },
  {
    kicker: "Badges",
    title: "Earn credit when your ideas land.",
    body: "Attribution, points, and Badges remember who helped shape the trip.",
    cta: "Next",
    Icon: Trophy,
  },
  {
    kicker: "Theme",
    title: "Light, dark, or auto?",
    body: "Pick how TripCast should look before the map opens.",
    cta: "Open the map",
    Icon: Sun,
  },
];
const LAST_BEAT_INDEX = BEATS.length - 1;

type IntroAdvanceTrigger = "surface-click" | "cta" | "keyboard";
type IntroBackTrigger = "back-button" | "keyboard";
type IntroFinishTrigger = "surface-click" | "cta" | "keyboard" | "skip-button";

export function introSeenStorageKey(role: Role, accountLabel?: string): string {
  return `${INTRO_STORAGE_PREFIX}.${role}.${accountLabel?.trim().toLowerCase() || "unknown"}`;
}

export function hasLocalIntroSeen(role: Role, accountLabel?: string): boolean {
  try {
    return window.localStorage.getItem(introSeenStorageKey(role, accountLabel)) === "1";
  } catch {
    return false;
  }
}

export function markLocalIntroSeen(role: Role, accountLabel?: string): void {
  try {
    window.localStorage.setItem(introSeenStorageKey(role, accountLabel), "1");
  } catch {
    // localStorage can be unavailable; backend seen state remains canonical.
  }
}

export function IntroSequence({
  role,
  accountLabel,
  userHandle = "you",
  travelerName = "the Traveler",
  source = "options-replay",
  onDone,
}: IntroSequenceProps) {
  const [beat, setBeat] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const beatRef = React.useRef(0);
  const finishedRef = React.useRef(false);
  const log = useDebugLogger("IntroSequence", "src/features/onboarding/IntroSequence.tsx");
  const { mode, resolvedTheme, setMode } = useTheme();
  const [themeChoice, setThemeChoice] = React.useState<ThemeMode>(mode);
  const [hasPickedTheme, setHasPickedTheme] = React.useState(false);
  const safeBeat = Math.min(Math.max(beat, 0), LAST_BEAT_INDEX);
  const current = BEATS[safeBeat];
  const isThemeBeat = safeBeat === LAST_BEAT_INDEX;
  const isDarkPreview = isThemeBeat && (
    themeChoice === "constellation" ||
    (themeChoice === "auto" && resolvedTheme === "constellation" && hasPickedTheme)
  );

  useActiveUiContext(true, {
    sheetName: "IntroSequence",
    label: "Onboarding intro",
    view: `beat-${safeBeat}`,
    source,
    sourceLabel: source === "account-create" ? "Create account" : "Options replay",
    file: "src/features/onboarding/IntroSequence.tsx",
  }, {
    boundsSelector: "[data-role='intro-sequence']",
  });

  React.useEffect(() => {
    log.logUi("intro:mount", {
      role,
      source,
      localSeen: hasLocalIntroSeen(role, accountLabel),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    return () => log.logUi("intro:unmount", { source });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const el = rootRef.current;
    const rect = el?.getBoundingClientRect();
    log.logUi("intro:beat:shown", {
      beat: safeBeat,
      renderedText: {
        kicker: current.kicker,
        title: current.title,
        body: current.body,
        cta: current.cta,
      },
      placement: rect
        ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
        : null,
      dims: rect ? { width: rect.width, height: rect.height } : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeBeat]);

  React.useEffect(() => {
    beatRef.current = safeBeat;
    if (beat !== safeBeat) {
      setBeat(safeBeat);
    }
  }, [beat, safeBeat]);

  const finish = React.useCallback((reason: IntroDoneReason, trigger: IntroFinishTrigger) => {
    const currentBeat = beatRef.current;
    if (finishedRef.current) {
      log.logUi("intro:done:ignored", { reason, trigger, beat: currentBeat });
      return;
    }
    finishedRef.current = true;
    log.logUi("intro:done", { reason, trigger, beat: currentBeat });
    onDone(reason);
  }, [log, onDone]);

  const advance = React.useCallback((trigger: IntroAdvanceTrigger) => {
    const currentBeat = Math.min(Math.max(beatRef.current, 0), LAST_BEAT_INDEX);
    if (finishedRef.current) {
      log.logUi("intro:advance:ignored", { trigger, beat: currentBeat, reason: "finished" });
      return;
    }
    if (currentBeat >= LAST_BEAT_INDEX) {
      finish("done", trigger);
      return;
    }

    const nextBeat = Math.min(currentBeat + 1, LAST_BEAT_INDEX);
    beatRef.current = nextBeat;
    log.logUi("intro:advance", { trigger, from: currentBeat, to: nextBeat });
    setBeat(nextBeat);
  }, [finish, log]);

  const chooseTheme = React.useCallback((nextMode: ThemeMode) => {
    setThemeChoice(nextMode);
    setHasPickedTheme(true);
    setMode(nextMode);
    log.logUi("intro:theme-select", {
      mode: nextMode,
      resolvedTheme: nextMode === "auto" ? resolvedTheme : nextMode,
      source,
    });
  }, [log, resolvedTheme, setMode, source]);

  const previous = React.useCallback((trigger: IntroBackTrigger) => {
    const currentBeat = Math.min(Math.max(beatRef.current, 0), LAST_BEAT_INDEX);
    if (finishedRef.current) {
      log.logUi("intro:back:ignored", { trigger, beat: currentBeat, reason: "finished" });
      return;
    }
    if (currentBeat <= 0) {
      log.logUi("intro:back:ignored", { trigger, beat: currentBeat, reason: "first-beat" });
      return;
    }

    const nextBeat = Math.max(0, currentBeat - 1);
    beatRef.current = nextBeat;
    log.logUi("intro:back", { trigger, from: currentBeat, to: nextBeat });
    setBeat(nextBeat);
  }, [log]);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === " " || event.key === "ArrowRight") {
        event.preventDefault();
        advance("keyboard");
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        previous("keyboard");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [advance, previous]);

  function skip(event: React.MouseEvent) {
    event.stopPropagation();
    finish("skip", "skip-button");
  }

  return (
    <div
      ref={rootRef}
      data-role="intro-sequence"
      className={cn(
        "fixed inset-0 z-[60] overflow-hidden transition-colors duration-500",
        isDarkPreview && "dark",
        isDarkPreview
          ? "bg-[var(--bg-paper)] text-[var(--ink-1)]"
          : "bg-[var(--meadow-bg)] text-[var(--meadow-ink)]"
      )}
      onClick={() => {
        if (!isThemeBeat) {
          advance("surface-click");
        }
      }}
    >
      <IntroBackdrop beat={safeBeat} isDark={isDarkPreview} />

      {safeBeat > 0 ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            previous("back-button");
          }}
          className={cn(
            "absolute left-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full border shadow-[var(--shadow-card)] backdrop-blur transition-all",
            isDarkPreview
              ? "border-[var(--ink-3)] bg-[var(--card)]/70 text-[var(--ink-2)]"
              : "border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)]/70 text-[var(--meadow-ink-soft)]"
          )}
          aria-label="Previous intro frame"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      ) : null}

      <button
        type="button"
        onClick={skip}
        className={cn(
          "absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full border shadow-[var(--shadow-card)] backdrop-blur transition-all",
          isDarkPreview
            ? "border-[var(--ink-3)] bg-[var(--card)]/80 text-[var(--ink-2)]"
            : "border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)]/80 text-[var(--meadow-ink-soft)]"
        )}
        aria-label="Skip"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>

      {/* Mute toggle on the right rail, directly below Skip — parity with the map control. */}
      <MusicMuteIndicator className="absolute right-4 top-16 z-10" />

      <div className="absolute left-1/2 top-6 z-10 flex -translate-x-1/2 gap-1.5" aria-hidden="true">
        {BEATS.map((_, i) => (
          <span
            key={i}
            className={cn("h-1.5 rounded-full transition-all duration-300", i === safeBeat ? "w-6" : "w-1.5")}
            style={{
              background: i <= safeBeat
                ? (isDarkPreview ? "var(--flag)" : "var(--meadow-primary)")
                : (isDarkPreview ? "var(--ink-3)" : "var(--meadow-paper-edge)")
            }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={safeBeat}
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -14, scale: 0.98 }}
          transition={{ duration: 0.42, ease: "easeOut" }}
          className="relative z-[1] flex h-full flex-col items-center justify-center px-5 pb-12 pt-16"
        >
          <BeatScene beat={safeBeat} current={current} userHandle={userHandle} travelerName={travelerName} />
          {isThemeBeat ? (
            <ThemeChoicePanel
              value={themeChoice}
              resolvedTheme={resolvedTheme}
              onChange={chooseTheme}
            />
          ) : null}
          <Button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              advance("cta");
            }}
            className="mt-8 h-12 rounded-full px-7 font-[var(--meadow-font-display)] text-base font-extrabold"
            style={{
              background: isDarkPreview ? "var(--flag)" : "var(--meadow-primary)",
              color: isDarkPreview ? "white" : "var(--meadow-primary-ink)",
            }}
          >
            {current.cta}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Button>
          {safeBeat < 1 ? (
            <p className="mt-4 font-[var(--meadow-font-mono,var(--font-mono))] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--meadow-ink-soft)]">
              Tap or press space to continue
            </p>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

type CreateAccountIntroFlowProps = {
  token: string;
  role: Role;
  accountLabel?: string;
  userHandle?: string;
  travelerName?: string;
  onDone: () => void;
};

export function CreateAccountIntroFlow({
  token,
  role,
  accountLabel,
  userHandle,
  travelerName,
  onDone,
}: CreateAccountIntroFlowProps) {
  const [stage, setStage] = React.useState<"logo" | "punch" | "welcome" | "welcome-out" | "intro">("logo");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const finishedRef = React.useRef(false);
  const markIntroSeen = useMutation(tripcastApi.onboarding.markIntroSeen);
  const log = useDebugLogger("CreateAccountIntroFlow", "src/features/onboarding/IntroSequence.tsx");
  const music = useMusicSafe();

  // Punch lands a fun "plop" — the earliest sound a brand-new user hears.
  React.useEffect(() => {
    if (stage === "punch") {
      music.sfx("plop");
      log.logAudio("account-intro:punch-plop", {});
    }
  }, [stage, music, log]);

  // Hold the soundtrack silent through the splash; start it as the first tour
  // beat appears (stage flips to "intro" → IntroSequence renders beat 0).
  // Declarative on `stage`, plus an unmount safety-release, so the "intro"
  // reason can never strand (same lock-safety contract as "auth"/"error").
  React.useEffect(() => {
    music.setSuppressed("intro", stage !== "intro");
    log.logAudio("account-intro:music-gate", { stage, suppressed: stage !== "intro" });
  }, [stage, music, log]);
  React.useEffect(() => {
    return () => music.setSuppressed("intro", false);
  }, [music]);

  useActiveUiContext(stage !== "intro", {
    sheetName: "CreateAccountIntroFlow",
    label: "Create account intro",
    view: stage,
    source: "account-create",
    sourceLabel: "Create account",
    file: "src/features/onboarding/IntroSequence.tsx",
  }, {
    boundsSelector: "[data-role='create-account-intro']",
  });

  React.useEffect(() => {
    const timers = [
      window.setTimeout(() => setStage("punch"), 2500),
      window.setTimeout(() => setStage("welcome"), 3500),
      window.setTimeout(() => setStage("welcome-out"), 7000),
      window.setTimeout(() => setStage("intro"), 8500),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  React.useEffect(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    log.logUi("account-intro:stage", {
      stage,
      renderedText: stage === "welcome" || stage === "welcome-out" ? "Welcome" : stage === "intro" ? "intro-sequence" : "TripCast logo",
      placement: rect
        ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
        : null,
      dims: rect ? { width: rect.width, height: rect.height } : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  async function finish(reason: IntroDoneReason) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    markLocalIntroSeen(role, accountLabel);
    log.logMutation("intro:mark-seen", { reason, role });
    try {
      await markIntroSeen({ token });
      log.logMutation("intro:mark-seen:success", { reason, role });
    } catch (error) {
      log.error("intro:mark-seen:error", "mutation", {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      onDone();
    }
  }

  if (stage === "intro") {
    return (
      <IntroSequence
        role={role}
        accountLabel={accountLabel}
        userHandle={userHandle}
        travelerName={travelerName}
        source="account-create"
        onDone={finish}
      />
    );
  }

  return (
    <div
      ref={rootRef}
      data-role="create-account-intro"
      className="fixed inset-0 z-[60] grid place-items-center overflow-hidden bg-[var(--meadow-bg)] px-6 text-center"
    >
      {/* Subtle mute toggle — top-right corner is otherwise empty here. */}
      <MusicMuteIndicator className="absolute right-4 top-4 z-10" />
      <IntroBackdrop beat={0} />
      <AnimatePresence mode="wait">
        {stage === "welcome" || stage === "welcome-out" ? (
          <motion.h1
            key="welcome"
            initial={{ opacity: 0, y: 8 }}
            animate={stage === "welcome-out" ? { opacity: 0, y: -8 } : { opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="relative z-[1] font-[var(--meadow-font-display)] text-5xl font-extrabold text-[var(--meadow-ink)]"
          >
            Welcome
          </motion.h1>
        ) : (
          <motion.div
            key="logo"
            initial={{ y: -96, opacity: 1, scale: 1 }}
            animate={stage === "punch" ? { y: 0, opacity: 0, scale: 1.45 } : { y: 0, opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: stage === "punch" ? 1 : 1.5, ease: stage === "punch" ? "easeIn" : "easeOut" }}
            className="relative z-[1] grid gap-4 justify-items-center"
          >
            <BrandCrest />
            <div className="font-[var(--meadow-font-display)] text-4xl font-extrabold leading-none text-[var(--meadow-ink)]">
              TripCast
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BrandCrest({ className }: { className?: string }) {
  return (
    <span
      className={cn("grid h-20 w-20 place-items-center rounded-[26px] text-white shadow-[0_16px_40px_rgba(255,139,74,0.35)]", className)}
      style={{ background: "var(--meadow-primary)" }}
      aria-hidden="true"
    >
      <Flag className="h-10 w-10" strokeWidth={2.5} />
    </span>
  );
}

function BeatScene({
  beat,
  current,
  userHandle,
  travelerName,
}: {
  beat: number;
  current: Beat;
  userHandle: string;
  travelerName: string;
}) {
  const Icon = current.Icon;
  const pose = beat === 0 ? "wave" : beat === 4 ? "cheer" : beat === 5 ? "idle" : "point";

  return (
    <div className="grid w-full max-w-sm translate-y-3 justify-items-center text-center">
      <div className="mb-5 h-32 w-full">
        <SceneCard beat={beat} />
      </div>
      <div className="mb-8 grid w-full grid-cols-[82px_minmax(0,1fr)] items-end gap-3">
        <IntroMascot pose={pose} size={3.4} />
        <div className="min-w-0 rounded-2xl border border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)] px-4 py-3 text-left text-sm font-semibold leading-snug text-[var(--meadow-ink)] shadow-[var(--shadow-card)]">
          {beat === 0 ? `Hi @${userHandle}. ${current.body}` : beat === 1 ? `${travelerName} posts the moments. You get the thread.` : current.body}
        </div>
      </div>
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)] px-3 py-1.5 font-[var(--meadow-font-display)] text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--meadow-ink-soft)]">
        <Icon className="h-3.5 w-3.5 text-[var(--meadow-primary)]" aria-hidden />
        {current.kicker}
      </div>
      <h1 className="font-[var(--meadow-font-display)] text-3xl font-extrabold leading-tight text-[var(--meadow-ink)]">
        {current.title}
      </h1>
    </div>
  );
}

function ThemeChoicePanel({
  value,
  resolvedTheme,
  onChange,
}: {
  value: ThemeMode;
  resolvedTheme: "meadow" | "constellation";
  onChange: (mode: ThemeMode) => void;
}) {
  const choices: Array<{ mode: ThemeMode; label: string; Icon: LucideIcon }> = [
    { mode: "meadow", label: "Light", Icon: Sun },
    { mode: "constellation", label: "Dark", Icon: Moon },
    { mode: "auto", label: "Auto", Icon: Sparkles },
  ];

  return (
    <div
      className="mt-6 grid w-full max-w-sm gap-3"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="grid grid-cols-3 gap-2">
        {choices.map(({ mode, label, Icon }) => {
          const active = value === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChange(mode)}
              aria-pressed={active}
              className={cn(
                "grid min-h-20 justify-items-center gap-2 rounded-2xl border px-2 py-3 font-[var(--meadow-font-display)] text-sm font-extrabold shadow-[var(--shadow-card)] transition-transform active:scale-[0.98]",
                active
                  ? "border-[var(--meadow-primary)] bg-[var(--meadow-primary)] text-[var(--meadow-primary-ink)]"
                  : "border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)] text-[var(--meadow-ink)]",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
      {value === "auto" ? (
        <p className="text-center font-[var(--meadow-font-mono,var(--font-mono))] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--meadow-ink-soft)]">
          Auto will open in {resolvedTheme === "constellation" ? "dark" : "light"} mode now
        </p>
      ) : null}
    </div>
  );
}

function SceneCard({ beat }: { beat: number }) {
  if (beat === 1) {
    return (
      <div className="grid h-full grid-cols-3 items-center gap-2">
        {["-rotate-3", "rotate-1", "rotate-3"].map((classes, index) => (
          <motion.div
            key={classes}
            initial={{ opacity: 0, y: 24, rotate: 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.14, duration: 0.45, ease: "easeOut" }}
            className={cn("h-24 rounded-md border border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)] p-2 shadow-[var(--shadow-card)]", classes)}
          >
            <div className="h-10 rounded bg-[var(--meadow-royal)]/20" />
            <div className="mt-2 h-2 w-20 rounded bg-[var(--meadow-primary)]/50" />
            <div className="mt-1 h-2 w-14 rounded bg-[var(--meadow-ink-very)]/40" />
          </motion.div>
        ))}
      </div>
    );
  }

  if (beat === 2) {
    return (
      <div className="relative h-full overflow-hidden rounded-[26px] border border-[var(--meadow-paper-edge)] bg-[#eaf2da] shadow-[var(--shadow-card)]">
        <div className="absolute inset-0 opacity-80" style={{ backgroundImage: "linear-gradient(135deg, transparent 0 42%, #bcd58a 42% 50%, transparent 50%), linear-gradient(35deg, transparent 0 55%, #b3def0 55% 68%, transparent 68%)" }} />
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.55, ease: "easeOut" }}
          className="absolute left-[62%] top-[35%] text-[var(--meadow-forest)]"
        >
          <MapPin className="h-10 w-10 fill-current text-[var(--meadow-forest)]" />
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
            animate={{ y: index === 1 ? -12 : 0, opacity: index === 0 ? 0.65 : 1 }}
            transition={{ delay: 0.15 + index * 0.12, duration: 0.45, ease: "easeOut" }}
            className={cn(
              "rounded-2xl border bg-[var(--meadow-paper)] p-3 text-left shadow-[var(--shadow-card)]",
              index === 1 ? "border-[var(--meadow-royal)]" : "border-[var(--meadow-paper-edge)]",
            )}
          >
            <div className="font-[var(--meadow-font-display)] text-sm font-extrabold text-[var(--meadow-ink)]">{label}</div>
            <div className="mt-3 h-2 overflow-hidden rounded bg-[var(--meadow-royal)]/20">
              <div className="h-full rounded bg-[var(--meadow-royal)]" style={{ width: index === 1 ? "68%" : "32%" }} />
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
        animate={{ rotateY: 0, scale: 1, opacity: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="mx-auto grid h-28 w-28 place-items-center rounded-full border-4 border-white bg-[var(--meadow-gold)] text-[var(--meadow-ink)] shadow-[0_14px_32px_rgba(255,184,74,0.45)]"
      >
        <Trophy className="h-12 w-12" aria-hidden />
      </motion.div>
    );
  }

  return (
    <div className="mx-auto w-fit rounded-full bg-[var(--meadow-paper)] p-5 shadow-[var(--shadow-card)]">
      <Sparkles className="h-16 w-16 text-[var(--meadow-primary)]" aria-hidden />
    </div>
  );
}

function IntroBackdrop({ beat, isDark }: { beat: number; isDark?: boolean }) {
  const isThemeBeat = beat === LAST_BEAT_INDEX;

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
        style={{ background: "radial-gradient(circle at 50% 35%, #1a1c2c 0%, #0c0d14 66%)" }}
      />

      {/* Sun / Moon — all beats so the transition fires on the theme beat */}
      <motion.div
        className={cn(
          "absolute right-10 top-16 h-24 w-24 rounded-full transition-colors duration-1000",
          isDark ? "bg-slate-200/20" : "bg-[var(--meadow-gold)]/40"
        )}
        animate={{ scale: beat % 2 === 0 ? 1 : 1.08, opacity: [0.45, 0.7, 0.45] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Clouds — all beats; fade out when isDark so the transition fires on the theme beat */}
      <div
        className={cn(
          "absolute left-8 top-32 h-10 w-28 rounded-full bg-white/65 transition-opacity duration-700",
          isDark ? "opacity-0" : "opacity-100"
        )}
      />
      <div
        className={cn(
          "absolute right-16 top-44 h-8 w-24 rounded-full bg-white/55 transition-opacity duration-700",
          isDark ? "opacity-0" : "opacity-100"
        )}
      />

      {/* Ground haze — non-theme beats only (would compete with ThemeChoicePanel) */}
      {!isThemeBeat && (
        <div className="absolute -bottom-16 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-[50%] bg-[var(--meadow-forest)]/10" />
      )}

      {/* Subtle grid overlay — theme beat only */}
      {isThemeBeat && (
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      )}

      {/* Starfield — theme beat + dark only; golden dots pulse subtly */}
      {isThemeBeat && isDark && (
        <motion.div
          className="absolute inset-0"
          animate={{ opacity: [0.04, 0.14, 0.04] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
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
    </div>
  );
}

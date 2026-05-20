import * as React from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "../../components/ui/button";
import { cn } from "@/lib/utils";
import { useMusicSafe } from "../../providers/MusicProvider";

import { PixelChar } from "./PixelChar";
import { SpeechBubble } from "./SpeechBubble";

const STORAGE_KEY = "tripcast.followerTourSeen";

export interface FollowerLandingTourProps {
  /** Username/handle the Follower signed in with. Renders into the welcome bubble. */
  userHandle?: string;
  /** Traveler's display name. Renders into copy where it's natural ("follow Yumi's trip"). */
  travelerName?: string;
  /** Called when the user finishes or skips the tour. The parent is responsible
   *  for the localStorage flag — we mirror it here defensively so multiple
   *  paths to "I've seen this" all converge. */
  onDone: () => void;
}

type Panel = {
  kicker: string;
  headline: string;
  bubble: string;
  cta: string;
  /** Secondary action only shown on the first panel — "Skip, I get it". */
  skip?: string;
};

function buildPanels(userHandle: string, travelerName: string): Panel[] {
  return [
    {
      kicker: "Welcome",
      headline: `Hey, @${userHandle}.`,
      bubble: `Welcome aboard. I'm here to help you follow ${travelerName}'s trip. Want a quick tour?`,
      cta: "Yes, tour me",
      skip: "Skip, I get it",
    },
    {
      kicker: "What this is",
      headline: "A live trip, not social media.",
      bubble: `${travelerName} is the only one out there. You and the rest of the follower are the audience — tap in when you want.`,
      cta: "Got it",
    },
    {
      kicker: "The HUD",
      headline: "How they're doing, at a glance.",
      bubble: `The card up top shows what ${travelerName} is doing right now — plus three meters: energy, stomach, calm. If a meter dips, you'll know.`,
      cta: "Next",
    },
    {
      kicker: "Missions & votes",
      headline: "Propose. Vote. Watch.",
      bubble: `Suggest a Mission — they'll decide if it's worth chasing. When the route's unclear, you'll get a Vote takeover. Tap, choose, weigh in.`,
      cta: "Next",
    },
    {
      kicker: "Story feed",
      headline: "Long check-ins become stories.",
      bubble: `Tap any pin or scroll the Story tab. Stories are postcards from someone who hasn't forgotten you.`,
      cta: "Next",
    },
    {
      kicker: "You're set",
      headline: "Onwards.",
      bubble: `If you ever want this again, find it in Options. Now — go follow them.`,
      cta: `Take me to ${travelerName}`,
    },
  ];
}

/**
 * Follower first-launch tour. Shows once per browser per follower
 * unless replayed from Options. The pixel character idles + bobs while
 * speaking each panel's bubble; the user advances via the primary CTA at
 * the bottom and can skip from the top-right.
 */
export default function FollowerLandingTour({
  userHandle = "you",
  travelerName = "the Traveler",
  onDone,
}: FollowerLandingTourProps) {
  const panels = React.useMemo(
    () => buildPanels(userHandle, travelerName),
    [userHandle, travelerName],
  );
  const [step, setStep] = React.useState(0);
  const [bubbleDone, setBubbleDone] = React.useState(false);
  const music = useMusicSafe();

  const panel = panels[step];

  function finish(sound: "close" | "success" = "close") {
    music.sfx(sound);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // localStorage may be unavailable in private mode — non-critical.
    }
    onDone();
  }

  function next() {
    if (step < panels.length - 1) {
      music.sfx("page");
      setStep((s) => s + 1);
      setBubbleDone(false);
    } else {
      finish("success");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--bg-paper)] px-5 py-6">
      {/* Progress dots + skip */}
      <div className="flex items-center justify-between">
        <div role="progressbar" aria-valuemin={1} aria-valuemax={panels.length} aria-valuenow={step + 1} className="flex gap-1.5">
          {panels.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step
                  ? "w-6"
                  : i < step
                    ? "w-1.5"
                    : "w-1.5 opacity-40",
              )}
              style={{
                background: i <= step ? "var(--flag)" : "var(--ink-3)",
              }}
              aria-hidden="true"
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => finish()}
          className="font-[var(--font-mono)] text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] hover:text-[var(--ink-1)]"
        >
          Skip
        </button>
      </div>

      {/* Pixel character + speech bubble */}
      <div className="flex flex-1 flex-col items-stretch justify-center gap-6 py-6">
        <div className="flex items-end justify-center gap-4">
          <PixelChar variant="explorer" size={96} />
          <div className="max-w-[260px] flex-1">
            <SpeechBubble
              key={step}
              text={panel.bubble}
              onTypingDone={() => setBubbleDone(true)}
            />
          </div>
        </div>

        {/* Kicker + headline below the character */}
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-3)]">
            {panel.kicker}
          </span>
          <h2 className="font-[var(--font-display)] text-2xl font-extrabold leading-tight tracking-tight text-[var(--ink-1)]">
            {panel.headline}
          </h2>
        </div>
      </div>

      {/* Footer CTA */}
      <div
        className="flex flex-col gap-2"
        style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
      >
        <Button
          type="button"
          onClick={next}
          className="h-12 rounded-2xl text-base"
          disabled={!bubbleDone && panels[step].bubble.length > 80}
          aria-label={panel.cta}
        >
          {panel.cta}
          <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
        </Button>
        {panel.skip ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => finish()}
            className="h-10 rounded-2xl"
          >
            {panel.skip}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Read-only check for the tour-seen flag. Used by the App to gate first-launch. */
export function hasSeenFollowerTour(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Force-clear the seen flag so the tour shows again. Used by "Replay tour" in Options. */
export function resetFollowerTourSeen(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

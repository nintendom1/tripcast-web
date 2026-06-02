import { useEffect, useMemo, useRef } from "react";

import { useMusicSafe } from "../../providers/MusicProvider";
import { useTheme } from "../../providers/ThemeProvider";
import type { AudioScenario } from "./engine";

export type ScenarioInput = {
  storyOpen: boolean;
  missionDetailOpen: boolean;
  achievementsOpen: boolean;
  voteSheetOpen: boolean;
};

type UseTripAudioScenarioArgs = ScenarioInput;

/**
 * Debounce window before committing a scenario change to the engine. Many
 * scenario transitions arrive as a brief OFF -> ON pair across two renders
 * (e.g. a sheet's onClose nulls the open state milliseconds before the next
 * pin click sets it again). Holding the commit briefly lets the second value
 * cancel the first, so the audio doesn't restart for transient flips.
 */
const SCENARIO_COMMIT_DELAY_MS = 200;

/**
 * Pure resolution. The map's day/night theme drives the default scenario so
 * the soundtrack stays visually aligned with the map.
 */
export function deriveTripAudioScenario(
  input: ScenarioInput,
  resolvedTheme: "meadow" | "constellation",
): AudioScenario {
  if (input.storyOpen || input.missionDetailOpen) return "story";
  if (input.achievementsOpen) return "trophy";
  if (input.voteSheetOpen) return "vote";
  return resolvedTheme === "constellation" ? "default-night" : "default-day";
}

export function useTripAudioScenario(args: UseTripAudioScenarioArgs) {
  const music = useMusicSafe();
  const { resolvedTheme } = useTheme();
  const lastCommittedRef = useRef<AudioScenario | null>(null);

  const scenario = useMemo(
    () => deriveTripAudioScenario(args, resolvedTheme),
    [args, resolvedTheme],
  );

  useEffect(() => {
    if (lastCommittedRef.current === scenario) return;
    const timeout = window.setTimeout(() => {
      lastCommittedRef.current = scenario;
      music.setScenario(scenario);
    }, SCENARIO_COMMIT_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [music, scenario]);

  return scenario;
}

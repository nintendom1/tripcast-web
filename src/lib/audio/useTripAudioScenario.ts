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
  const lastScenarioRef = useRef<AudioScenario | null>(null);

  const scenario = useMemo(
    () => deriveTripAudioScenario(args, resolvedTheme),
    [args, resolvedTheme],
  );

  useEffect(() => {
    if (lastScenarioRef.current === scenario) return;
    lastScenarioRef.current = scenario;
    music.setScenario(scenario);
  }, [music, scenario]);

  return scenario;
}

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "convex/react";

import {
  tripcastApi,
  type Role,
  type TravelFundsConfigForTraveler,
  type TravelFundsSummaryForCrew,
} from "../../convex/tripcastApi";
import { useMusicSafe } from "../../providers/MusicProvider";
import type { AudioScenario } from "./engine";

type ScenarioInput = {
  storyOpen: boolean;
  overBudget: boolean;
  voteActive: boolean;
  challengeActive: boolean;
};

type UseTripAudioScenarioArgs = {
  token: string;
  role: Role;
  storyOpen: boolean;
  voteActive: boolean;
  challengeActive: boolean;
};

export function deriveTripAudioScenario({
  storyOpen,
  overBudget,
  voteActive,
  challengeActive,
}: ScenarioInput): AudioScenario {
  if (storyOpen) return "story";
  if (overBudget) return "overBudget";
  if (voteActive) return "voteActive";
  if (challengeActive) return "challengeActive";
  return "idle";
}

function isOverBudget(
  funds: TravelFundsConfigForTraveler | TravelFundsSummaryForCrew | undefined,
) {
  return funds?.enabled === true && funds.remainingUsd < 0;
}

export function useTripAudioScenario({
  token,
  role,
  storyOpen,
  voteActive,
  challengeActive,
}: UseTripAudioScenarioArgs) {
  const music = useMusicSafe();
  const lastScenarioRef = useRef<AudioScenario | null>(null);
  const travelerFunds = useQuery(
    tripcastApi.travelFunds.travelerGetConfig,
    role === "traveler" ? { token } : "skip",
  );
  const crewFunds = useQuery(
    tripcastApi.travelFunds.supportCrewGetFundsSummary,
    role === "support_crew" ? { token } : "skip",
  );

  const scenario = useMemo(
    () =>
      deriveTripAudioScenario({
        storyOpen,
        overBudget: isOverBudget(role === "traveler" ? travelerFunds : crewFunds),
        voteActive,
        challengeActive,
      }),
    [challengeActive, crewFunds, role, storyOpen, travelerFunds, voteActive],
  );

  useEffect(() => {
    if (lastScenarioRef.current === scenario) return;
    lastScenarioRef.current = scenario;
    music.setScenario(scenario);
  }, [music, scenario]);

  return scenario;
}

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "convex/react";

import {
  tripcastApi,
  type Role,
  type TravelFundsConfigForTraveler,
  type TravelFundsSummaryForFollower,
} from "../../convex/tripcastApi";
import { useMusicSafe } from "../../providers/MusicProvider";
import type { AudioScenario } from "./engine";

type ScenarioInput = {
  storyOpen: boolean;
  overBudget: boolean;
  voteActive: boolean;
  missionActive: boolean;
};

type UseTripAudioScenarioArgs = {
  token: string;
  role: Role;
  storyOpen: boolean;
  voteActive: boolean;
  missionActive: boolean;
};

export function deriveTripAudioScenario({
  storyOpen,
  overBudget,
  voteActive,
  missionActive,
}: ScenarioInput): AudioScenario {
  if (storyOpen) return "story";
  if (overBudget) return "overBudget";
  if (voteActive) return "voteActive";
  if (missionActive) return "missionActive";
  return "idle";
}

function isOverBudget(
  funds: TravelFundsConfigForTraveler | TravelFundsSummaryForFollower | undefined,
) {
  return funds?.enabled === true && funds.remainingUsd < 0;
}

export function useTripAudioScenario({
  token,
  role,
  storyOpen,
  voteActive,
  missionActive,
}: UseTripAudioScenarioArgs) {
  const music = useMusicSafe();
  const lastScenarioRef = useRef<AudioScenario | null>(null);
  const travelerFunds = useQuery(
    tripcastApi.travelFunds.travelerGetConfig,
    role === "traveler" ? { token } : "skip",
  );
  const followerFunds = useQuery(
    tripcastApi.travelFunds.followerGetFundsSummary,
    role === "follower" ? { token } : "skip",
  );

  const scenario = useMemo(
    () =>
      deriveTripAudioScenario({
        storyOpen,
        overBudget: isOverBudget(role === "traveler" ? travelerFunds : followerFunds),
        voteActive,
        missionActive,
      }),
    [missionActive, followerFunds, role, storyOpen, travelerFunds, voteActive],
  );

  useEffect(() => {
    if (lastScenarioRef.current === scenario) return;
    lastScenarioRef.current = scenario;
    music.setScenario(scenario);
  }, [music, scenario]);

  return scenario;
}

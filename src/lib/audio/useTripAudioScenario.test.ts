import { describe, expect, it } from "vitest";

import { deriveTripAudioScenario, type ScenarioInput } from "./useTripAudioScenario";

const allClosed: ScenarioInput = {
  storyOpen: false,
  missionDetailOpen: false,
  achievementsOpen: false,
  voteSheetOpen: false,
};

describe("deriveTripAudioScenario", () => {
  it("returns default-day under meadow theme when nothing is open", () => {
    expect(deriveTripAudioScenario(allClosed, "meadow")).toBe("default-day");
  });

  it("returns default-night under constellation theme when nothing is open", () => {
    expect(deriveTripAudioScenario(allClosed, "constellation")).toBe("default-night");
  });

  it("returns story when StoryDetailSheet is open", () => {
    expect(
      deriveTripAudioScenario({ ...allClosed, storyOpen: true }, "meadow"),
    ).toBe("story");
  });

  it("returns story when MissionDetailSheet is open", () => {
    expect(
      deriveTripAudioScenario({ ...allClosed, missionDetailOpen: true }, "meadow"),
    ).toBe("story");
  });

  it("returns trophy when AchievementsSheet is open", () => {
    expect(
      deriveTripAudioScenario({ ...allClosed, achievementsOpen: true }, "meadow"),
    ).toBe("trophy");
  });

  it("returns vote when RouteVotePanel is open", () => {
    expect(
      deriveTripAudioScenario({ ...allClosed, voteSheetOpen: true }, "meadow"),
    ).toBe("vote");
  });

  it("story wins over trophy and vote when multiple are open", () => {
    expect(
      deriveTripAudioScenario(
        { storyOpen: true, missionDetailOpen: false, achievementsOpen: true, voteSheetOpen: true },
        "meadow",
      ),
    ).toBe("story");
  });

  it("trophy wins over vote when both are open and no story", () => {
    expect(
      deriveTripAudioScenario(
        { ...allClosed, achievementsOpen: true, voteSheetOpen: true },
        "meadow",
      ),
    ).toBe("trophy");
  });

  it("theme determines day-vs-night fallback when no panel is open", () => {
    expect(deriveTripAudioScenario(allClosed, "meadow")).toBe("default-day");
    expect(deriveTripAudioScenario(allClosed, "constellation")).toBe("default-night");
  });
});

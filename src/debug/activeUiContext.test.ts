import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearActiveUiContext,
  formatActiveUiContextForCopy,
  formatActiveUiContextForSummary,
  getActiveUiContext,
  getFloatingDebugSettings,
  resetActiveUiContextForTests,
  setActiveUiContext,
  setFloatingDebugButtonMode,
  setFloatingDebugIncludeFile,
  setFloatingDebugShowSource,
  subscribeActiveUiContext,
  updateActiveUiContext,
} from "./activeUiContext";

beforeEach(() => {
  localStorage.clear();
  resetActiveUiContextForTests();
  window.history.replaceState(null, "", "/");
});

describe("active UI context registry", () => {
  it("keeps the latest registered surface active and restores the previous one on clear", () => {
    setActiveUiContext("journal", {
      sheetName: "JournalSheet",
      label: "Journal",
      view: "list:story",
      sourceLabel: "Dock -> Journal",
      openedAt: 100,
    });
    setActiveUiContext("story", {
      sheetName: "StoryDetailSheet",
      label: "Story detail",
      view: "narrative",
      sourceLabel: "Journal -> Story",
      openedAt: 200,
    });

    expect(getActiveUiContext()?.sheetName).toBe("StoryDetailSheet");

    clearActiveUiContext("story");

    expect(getActiveUiContext()).toMatchObject({
      sheetName: "JournalSheet",
      label: "Journal",
      view: "list:story",
    });
  });

  it("updates only the owning context", () => {
    setActiveUiContext("missions", {
      sheetName: "MissionPanel",
      label: "Missions",
      view: "list",
    });

    expect(updateActiveUiContext("other", { view: "detail" })).toBeNull();
    updateActiveUiContext("missions", { view: "detail" });

    expect(getActiveUiContext()?.view).toBe("detail");
  });

  it("notifies subscribers when context and settings change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeActiveUiContext(listener);

    setActiveUiContext("funds", { sheetName: "TravelFundsSheet", label: "Travel Funds" });
    setFloatingDebugShowSource(false);
    unsubscribe();
    setFloatingDebugIncludeFile(false);

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("floating debug settings", () => {
  it("defaults to detailed context with source and copied file paths enabled", () => {
    expect(getFloatingDebugSettings()).toEqual({
      buttonMode: "detailed-context",
      showSource: true,
      includeFileInCopies: true,
    });
  });

  it("persists configured settings", () => {
    setFloatingDebugButtonMode("compact-context");
    setFloatingDebugShowSource(false);
    setFloatingDebugIncludeFile(false);

    expect(getFloatingDebugSettings()).toEqual({
      buttonMode: "compact-context",
      showSource: false,
      includeFileInCopies: false,
    });
  });
});

describe("active UI context formatting", () => {
  it("formats copied context with file paths and bounds", () => {
    setActiveUiContext("achievements", {
      sheetName: "AchievementsSheet",
      label: "Achievements",
      view: "badge-detail",
      sourceLabel: "Badge chip",
      file: "src/features/achievements/AchievementsSheet.tsx",
      openedAt: 1710000000000,
      bounds: { x: 0, y: 214, w: 390, h: 630 },
    });

    const text = formatActiveUiContextForCopy();

    expect(text).toContain("Active sheet: AchievementsSheet");
    expect(text).toContain("Label: Achievements");
    expect(text).toContain("View: badge-detail");
    expect(text).toContain("Source: Badge chip");
    expect(text).toContain("File: src/features/achievements/AchievementsSheet.tsx");
    expect(text).toContain("Bounds: x=0 y=214 w=390 h=630");
  });

  it("omits file paths from copies when disabled", () => {
    setActiveUiContext("options", {
      sheetName: "OptionsSheet",
      label: "Options",
      file: "src/features/options/OptionsSheet.tsx",
    });
    setFloatingDebugIncludeFile(false);

    expect(formatActiveUiContextForCopy()).not.toContain("File:");
    expect(formatActiveUiContextForSummary().join("\n")).not.toContain("File:");
  });

  it("redacts sensitive query params in copied route", () => {
    window.history.replaceState(null, "", "/trip?invite=abc&view=map&email=a@example.com");

    const text = formatActiveUiContextForCopy(null);

    expect(text).toContain("Route: /trip?view=map");
    expect(text).not.toContain("invite");
    expect(text).not.toContain("email");
  });
});

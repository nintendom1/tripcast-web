import { useMemo } from "react";
import { log, registerComponent, type DebugCategory, type DebugLevel } from "./debugLogger";

export interface DebugLogger {
  debug: (action: string, category?: DebugCategory, details?: Record<string, unknown>, state?: Record<string, unknown>) => void;
  info:  (action: string, category?: DebugCategory, details?: Record<string, unknown>, state?: Record<string, unknown>) => void;
  warn:  (action: string, category?: DebugCategory, details?: Record<string, unknown>, state?: Record<string, unknown>) => void;
  error: (action: string, category?: DebugCategory, details?: Record<string, unknown>, state?: Record<string, unknown>) => void;
  logInteraction: (action: string, details?: Record<string, unknown>) => void;
  logMap: (action: string, details?: Record<string, unknown>) => void;
  logUi: (action: string, details?: Record<string, unknown>) => void;
  logAuth: (action: string, details?: Record<string, unknown>) => void;
  logMutation: (action: string, details?: Record<string, unknown>) => void;
  logQuery: (action: string, level?: DebugLevel, details?: Record<string, unknown>) => void;
  logForm: (action: string, details?: Record<string, unknown>) => void;
  logAudio: (action: string, details?: Record<string, unknown>) => void;
  logState: (stateName: string, before: unknown, after?: unknown) => void;
  logFunds: (action: string, details?: Record<string, unknown>) => void;
  logPerformance: (action: string, details?: Record<string, unknown>) => void;
  withLoggedHandler: <T>(action: string, handler: () => T) => T;
}

function makeLogger(src: string): DebugLogger {
  const emit = (level: DebugLevel, action: string, category: DebugCategory, details?: Record<string, unknown>, state?: Record<string, unknown>) =>
    log(level, src, action, category, details, state);

  return {
    debug: (action, category = "debug", details, state) => emit("debug", action, category, details, state),
    info:  (action, category = "debug", details, state) => emit("info",  action, category, details, state),
    warn:  (action, category = "debug", details, state) => emit("warn",  action, category, details, state),
    error: (action, category = "error", details, state) => emit("error", action, category, details, state),
    logInteraction: (action, details) => emit("info", action, "ui", details),
    logMap: (action, details) => emit("info", action, "map", details),
    logUi: (action, details) => emit("info", action, "ui", details),
    logAuth: (action, details) => emit("info", action, "auth", details),
    logMutation: (action, details) => emit("info", action, "mutation", details),
    logQuery: (action, level = "info", details) => emit(level, action, "query", details),
    logForm: (action, details) => emit("info", action, "form", details),
    logAudio: (action, details) => emit("info", action, "audio", details),
    logState: (stateName, before, after) =>
      emit("debug", `state:${stateName}`, "state", undefined, { before, after } as Record<string, unknown>),
    logFunds: (action, details) => emit("info", action, "funds", details),
    logPerformance: (action, details) => emit("info", action, "performance", details),
    withLoggedHandler: <T>(action: string, handler: () => T): T => {
      emit("info", action, "ui");
      return handler();
    },
  };
}

/**
 * Returns stable log helpers scoped to a component name.
 * filePath is registered once for the LLM summary component map.
 * All helpers are no-ops when debug logging is disabled.
 */
export function useDebugLogger(componentName: string, filePath: string): DebugLogger {
  registerComponent(componentName, filePath);
  return useMemo(() => makeLogger(componentName), [componentName]);
}

/** Non-hook version for use in class components or outside React. */
export function debugLoggerFor(componentName: string, filePath: string): DebugLogger {
  registerComponent(componentName, filePath);
  return makeLogger(componentName);
}

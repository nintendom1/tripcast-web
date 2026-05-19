import { useMemo } from "react";
import { log, registerComponent, type DebugLevel } from "./debugLogger";

export interface DebugLogger {
  debug: (action: string, details?: Record<string, unknown>, state?: Record<string, unknown>) => void;
  info:  (action: string, details?: Record<string, unknown>, state?: Record<string, unknown>) => void;
  warn:  (action: string, details?: Record<string, unknown>, state?: Record<string, unknown>) => void;
  error: (action: string, details?: Record<string, unknown>, state?: Record<string, unknown>) => void;
  logInteraction: (action: string, details?: Record<string, unknown>) => void;
  logStateChange: (stateName: string, before: unknown, after?: unknown) => void;
  withLoggedHandler: <T>(action: string, handler: () => T) => T;
}

function makeLogger(src: string): DebugLogger {
  const emit = (level: DebugLevel, action: string, details?: Record<string, unknown>, state?: Record<string, unknown>) =>
    log(level, src, action, details, state);

  return {
    debug: (action, details, state) => emit("debug", action, details, state),
    info:  (action, details, state) => emit("info",  action, details, state),
    warn:  (action, details, state) => emit("warn",  action, details, state),
    error: (action, details, state) => emit("error", action, details, state),
    logInteraction: (action, details) => emit("info", action, details),
    logStateChange: (stateName, before, after) =>
      emit("debug", `state:${stateName}`, undefined, { before, after } as Record<string, unknown>),
    withLoggedHandler: <T>(action: string, handler: () => T): T => {
      emit("info", action);
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

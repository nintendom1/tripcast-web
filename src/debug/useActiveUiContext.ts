import { useEffect, useId, useRef } from "react";
import {
  clearActiveUiContext,
  setActiveUiContext,
  updateActiveUiContext,
  type ActiveUiBounds,
  type ActiveUiContextInput,
} from "./activeUiContext";
import { useDebugLogger } from "./useDebugLogger";

type UseActiveUiContextOptions = {
  enabled?: boolean;
  boundsSelector?: string;
};

function readBounds(selector?: string): ActiveUiBounds | undefined {
  if (!selector || typeof document === "undefined") return undefined;
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) return undefined;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return undefined;
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.width),
    h: Math.round(rect.height),
  };
}

function copyLogPayload(context: ActiveUiContextInput): Record<string, unknown> {
  return {
    sheetName: context.sheetName,
    label: context.label,
    view: context.view,
    source: context.source,
    sourceLabel: context.sourceLabel,
    file: context.file,
    bounds: context.bounds,
  };
}

export function useActiveUiContext(
  open: boolean,
  context: ActiveUiContextInput,
  options: UseActiveUiContextOptions = {},
): void {
  const ownerId = useId();
  const log = useDebugLogger("ActiveUiContext", "src/debug/useActiveUiContext.ts");
  const previousViewRef = useRef<string | undefined>(context.view);
  const activeRef = useRef(false);
  const enabled = options.enabled ?? true;

  useEffect(() => {
    if (!open || !enabled) {
      if (activeRef.current) {
        const previous = clearActiveUiContext(ownerId);
        activeRef.current = false;
        if (previous) {
          log.logUi("sheet:active:clear", {
            sheetName: previous.sheetName,
            view: previous.view,
            durationMs: Date.now() - previous.openedAt,
          });
          log.logUi("sheet:close", {
            sheetName: previous.sheetName,
            view: previous.view,
            durationMs: Date.now() - previous.openedAt,
          });
        }
      }
      return;
    }

    const bounds = context.bounds ?? readBounds(options.boundsSelector);
    const nextContext = { ...context, bounds };
    const active = setActiveUiContext(ownerId, nextContext);
    activeRef.current = true;
    previousViewRef.current = nextContext.view;
    log.logUi("sheet:active:set", copyLogPayload(active));
    log.logUi("sheet:open", copyLogPayload(active));

    return () => {
      const previous = clearActiveUiContext(ownerId);
      activeRef.current = false;
      if (previous) {
        log.logUi("sheet:active:clear", {
          sheetName: previous.sheetName,
          view: previous.view,
          durationMs: Date.now() - previous.openedAt,
        });
        log.logUi("sheet:close", {
          sheetName: previous.sheetName,
          view: previous.view,
          durationMs: Date.now() - previous.openedAt,
        });
      }
    };
    // Re-register only on open/close or identity/source changes; view changes
    // update below so openedAt remains stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    enabled,
    ownerId,
    context.sheetName,
    context.label,
    context.source,
    context.sourceLabel,
    context.file,
    options.boundsSelector,
  ]);

  useEffect(() => {
    if (!open || !enabled || !activeRef.current) return;
    const bounds = context.bounds ?? readBounds(options.boundsSelector);
    const previousView = previousViewRef.current;
    const next = updateActiveUiContext(ownerId, { view: context.view, bounds });
    if (next && previousView !== context.view) {
      log.logUi("sheet:view:change", {
        sheetName: context.sheetName,
        fromView: previousView,
        toView: context.view,
        source: context.source,
        sourceLabel: context.sourceLabel,
      });
      previousViewRef.current = context.view;
    }
  }, [
    open,
    enabled,
    ownerId,
    context.sheetName,
    context.view,
    context.source,
    context.sourceLabel,
    context.bounds,
    options.boundsSelector,
    log,
  ]);
}

import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

const TOOLTIP_GUTTER_PX = 16;
const TOOLTIP_MAX_WIDTH_PX = 288;

interface InfoTooltipRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface InfoTooltipPlacement {
  viewport: {
    width: number;
    height: number;
  };
  trigger: InfoTooltipRect;
  tooltip: InfoTooltipRect;
  left: number;
  width: number;
  clamped: boolean;
}

interface InfoTooltipProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  onOpenChange?: (open: boolean, placement?: InfoTooltipPlacement) => void;
}

function rectToDetails(rect: DOMRect): InfoTooltipRect {
  return {
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    left: Math.round(rect.left),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

export function InfoTooltip({
  label,
  children,
  className,
  onOpenChange,
}: InfoTooltipProps) {
  const [open, setOpen] = React.useState(false);
  const [tooltipStyle, setTooltipStyle] = React.useState<React.CSSProperties>(() => ({
    left: 0,
    width: TOOLTIP_MAX_WIDTH_PX,
  }));
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const tooltipRef = React.useRef<HTMLSpanElement>(null);
  const onOpenChangeRef = React.useRef(onOpenChange);

  onOpenChangeRef.current = onOpenChange;

  function setOpenAndNotify(next: boolean) {
    setOpen(next);
    if (!next) onOpenChangeRef.current?.(false);
  }

  React.useLayoutEffect(() => {
    if (!open) return;
    const wrapper = wrapperRef.current;
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!wrapper || !trigger || !tooltip) return;

    const viewportWidth = Math.round(window.visualViewport?.width ?? window.innerWidth);
    const viewportHeight = Math.round(window.visualViewport?.height ?? window.innerHeight);
    const tooltipWidth = Math.max(0, Math.min(TOOLTIP_MAX_WIDTH_PX, viewportWidth - TOOLTIP_GUTTER_PX * 2));
    const wrapperRect = wrapper.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const minLeft = TOOLTIP_GUTTER_PX;
    const maxLeft = Math.max(minLeft, viewportWidth - TOOLTIP_GUTTER_PX - tooltipWidth);
    const viewportLeft = Math.min(Math.max(triggerRect.left, minLeft), maxLeft);
    const left = Math.round(viewportLeft - wrapperRect.left);
    const clamped = viewportLeft !== triggerRect.left;

    setTooltipStyle({
      left,
      width: Math.round(tooltipWidth),
    });

    const measuredTooltipRect = tooltip.getBoundingClientRect();
    onOpenChangeRef.current?.(true, {
      viewport: {
        width: viewportWidth,
        height: viewportHeight,
      },
      trigger: rectToDetails(triggerRect),
      tooltip: {
        ...rectToDetails(measuredTooltipRect),
        left: Math.round(viewportLeft),
        right: Math.round(viewportLeft + tooltipWidth),
        width: Math.round(tooltipWidth),
      },
      left,
      width: Math.round(tooltipWidth),
      clamped,
    });
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onDocPointer(e: Event) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpenAndNotify(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenAndNotify(false);
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("touchstart", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("touchstart", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={wrapperRef}
      className={cn("relative inline-flex items-center", className)}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpenAndNotify(!open)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <span
          ref={tooltipRef}
          role="tooltip"
          style={tooltipStyle}
          className="absolute top-full z-50 mt-1.5 rounded-md border bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-md"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

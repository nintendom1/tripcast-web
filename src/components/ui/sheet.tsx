import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ChevronLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";

const Sheet = Dialog.Root;
const SheetTrigger = Dialog.Trigger;
const SheetClose = Dialog.Close;
const SheetPortal = Dialog.Portal;

const SheetBackdrop = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Dialog.Backdrop>
>(({ className, ...props }, ref) => (
  <Dialog.Backdrop
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/40", className)}
    {...props}
  />
));
SheetBackdrop.displayName = "SheetBackdrop";

interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof Dialog.Popup> {
  side?: "top" | "right" | "bottom" | "left";
  showBackdrop?: boolean;
  /**
   * Non-modal map-adjacent sheets: lowers z-index to z-10 (below the Dock at z-20)
   * and adds 100px bottom padding so scrollable content clears the Dock.
   * Use on all bottom sheets with modal={false} showBackdrop={false}.
   */
  mapAdjacent?: boolean;
}

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ side = "right", showBackdrop = true, mapAdjacent = false, className, children, ...props }, ref) => (
    <SheetPortal>
      {showBackdrop ? <SheetBackdrop /> : null}
      <Dialog.Popup
        ref={ref}
        className={cn(
          "fixed z-50 flex flex-col bg-background shadow-xl",
          mapAdjacent && "z-[10] pb-[100px]",
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t transition-transform duration-200 ease-out data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
          side === "top" &&
            "inset-x-0 top-0 max-h-[85dvh] rounded-b-xl border-b transition-transform duration-200 ease-out data-[ending-style]:-translate-y-full data-[starting-style]:-translate-y-full",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r transition-transform duration-200 ease-out data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full",
          side === "right" &&
            "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l transition-transform duration-200 ease-out data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full",
          className,
        )}
        {...props}
      >
        {children}
      </Dialog.Popup>
    </SheetPortal>
  ),
);
SheetContent.displayName = "SheetContent";

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 p-4", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse gap-2 p-4 pt-0 sm:flex-row sm:justify-end", className)}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof Dialog.Title>
>(({ className, ...props }, ref) => (
  <Dialog.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof Dialog.Description>
>(({ className, ...props }, ref) => (
  <Dialog.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";

const SheetGrabber = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    aria-hidden="true"
    className={cn("mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--meter-track)]", className)}
    {...props}
  />
);
SheetGrabber.displayName = "SheetGrabber";

interface SheetKickerProps extends React.HTMLAttributes<HTMLDivElement> {
  dotColor?: string;
}

const SheetKicker = ({ className, dotColor, children, ...props }: SheetKickerProps) => (
  <div
    className={cn(
      "flex items-center gap-1.5 font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]",
      className,
    )}
    {...props}
  >
    {dotColor ? (
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: dotColor }}
      />
    ) : null}
    {children}
  </div>
);
SheetKicker.displayName = "SheetKicker";

interface SheetBackButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const SheetBackButton = React.forwardRef<HTMLButtonElement, SheetBackButtonProps>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label="Back"
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-1)] transition-colors hover:bg-[var(--meter-track)]",
        className,
      )}
      {...props}
    >
      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
    </button>
  ),
);
SheetBackButton.displayName = "SheetBackButton";

interface SheetCloseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const SheetCloseButton = React.forwardRef<HTMLButtonElement, SheetCloseButtonProps>(
  ({ className, ...props }, ref) => (
    <Dialog.Close
      ref={ref}
      aria-label="Close"
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-1)] transition-colors hover:bg-[var(--meter-track)]",
        className,
      )}
      {...props}
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </Dialog.Close>
  ),
);
SheetCloseButton.displayName = "SheetCloseButton";

interface SheetTabsProps extends React.HTMLAttributes<HTMLDivElement> {}

const SheetTabs = ({ className, ...props }: SheetTabsProps) => (
  <div
    role="tablist"
    className={cn(
      "flex gap-1 overflow-x-auto border-b border-[var(--line-soft)] px-4 pb-2",
      className,
    )}
    {...props}
  />
);
SheetTabs.displayName = "SheetTabs";

interface SheetTabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

const SheetTab = React.forwardRef<HTMLButtonElement, SheetTabProps>(
  ({ className, active = false, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "bg-[var(--ink-1)] text-[var(--ink-on-dark)]"
          : "text-[var(--ink-2)] hover:bg-[var(--meter-track)]",
        className,
      )}
      {...props}
    />
  ),
);
SheetTab.displayName = "SheetTab";

const SheetBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex-1 overflow-y-auto p-4", className)} {...props} />
);
SheetBody.displayName = "SheetBody";

interface SheetAccentRailProps extends React.HTMLAttributes<HTMLDivElement> {
  color?: string;
}

const SheetAccentRail = ({ color, className, style, ...props }: SheetAccentRailProps) => (
  <div
    aria-hidden="true"
    className={cn("absolute left-0 right-0 top-0 h-1 rounded-t-xl", className)}
    style={color ? { background: color, ...style } : style}
    {...props}
  />
);
SheetAccentRail.displayName = "SheetAccentRail";

interface SheetPersonalityTagProps extends React.HTMLAttributes<HTMLDivElement> {
  motif?: string;
  tag: string;
  color?: string;
}

const SheetPersonalityTag = ({ motif, tag, color, className, style, ...props }: SheetPersonalityTagProps) => (
  <div
    className={cn(
      "inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em]",
      className,
    )}
    style={color ? { color, fontFamily: "var(--meadow-font-display)", ...style } : { fontFamily: "var(--meadow-font-display)", ...style }}
    {...props}
  >
    {motif ? <span aria-hidden="true" className="text-xs leading-none">{motif}</span> : null}
    {tag}
  </div>
);
SheetPersonalityTag.displayName = "SheetPersonalityTag";

export {
  Sheet,
  SheetPortal,
  SheetBackdrop,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetGrabber,
  SheetKicker,
  SheetBackButton,
  SheetCloseButton,
  SheetTabs,
  SheetTab,
  SheetBody,
  SheetAccentRail,
  SheetPersonalityTag,
};

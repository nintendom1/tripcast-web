import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
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
}

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ side = "right", className, children, ...props }, ref) => (
    <SheetPortal>
      <SheetBackdrop />
      <Dialog.Popup
        ref={ref}
        className={cn(
          "fixed z-50 flex flex-col bg-background shadow-xl",
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t",
          side === "top" &&
            "inset-x-0 top-0 max-h-[85dvh] rounded-b-xl border-b",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r",
          side === "right" &&
            "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l",
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
};

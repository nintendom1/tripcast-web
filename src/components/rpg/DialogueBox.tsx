import * as React from "react";
import { cn } from "@/lib/utils";

type DialogueBoxProps = {
  title?: string;
  className?: string;
  children: React.ReactNode;
};

export function DialogueBox({ title, className, children }: DialogueBoxProps) {
  return (
    <div className={cn("relative rounded-md border bg-card p-4", className)}>
      {title && (
        <span className="absolute -top-3 left-3 bg-background px-1 text-xs font-medium text-muted-foreground">
          {title}
        </span>
      )}
      {children}
    </div>
  );
}

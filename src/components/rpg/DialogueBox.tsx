import * as React from "react";
import { cn } from "@/lib/utils";

type DialogueBoxProps = {
  title?: string;
  className?: string;
  children: React.ReactNode;
};

export function DialogueBox({ title, className, children }: DialogueBoxProps) {
  return (
    <div className={cn("relative rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] p-4 text-[var(--ink-1)]", className)}>
      {title && (
        <span className="absolute -top-3 left-3 bg-[var(--bg-card)] px-1 text-xs font-medium text-[var(--ink-3)]">
          {title}
        </span>
      )}
      {children}
    </div>
  );
}

import * as React from "react";
import { cn } from "@/lib/utils";

type ChoiceListProps = {
  children: React.ReactNode;
  className?: string;
};

type ChoiceItemProps = {
  index: number;
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
};

export function ChoiceList({ children, className }: ChoiceListProps) {
  return <div className={cn("flex flex-col", className)}>{children}</div>;
}

export function ChoiceItem({ index, selected, onClick, children }: ChoiceItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
      className={cn(
        "flex items-start gap-3 border-l-2 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        selected
          ? "border-l-primary bg-accent text-accent-foreground"
          : "border-l-transparent hover:border-l-muted-foreground hover:bg-accent/50",
      )}
    >
      <span className="w-5 shrink-0 text-sm font-medium text-muted-foreground">{index}.</span>
      <span>{children}</span>
    </button>
  );
}

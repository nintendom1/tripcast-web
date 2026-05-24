import * as React from "react";
import { cn } from "@/lib/utils";

type ChoiceListProps = {
  children: React.ReactNode;
  className?: string;
};

type ChoiceItemProps = {
  index: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
};

export function ChoiceList({ children, className }: ChoiceListProps) {
  return <div className={cn("flex flex-col", className)}>{children}</div>;
}

export function ChoiceItem({ index, selected, disabled, onClick, children }: ChoiceItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
      disabled={disabled}
      className={cn(
        "flex items-start gap-3 border-l-2 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-l-[var(--flag)] bg-[var(--meter-track)] text-[var(--ink-1)]"
          : "border-l-transparent text-[var(--ink-2)] hover:border-l-[var(--ink-3)] hover:bg-[var(--meter-track)]",
      )}
    >
      <span className="w-5 shrink-0 text-sm font-medium text-[var(--ink-3)]">{index}.</span>
      <span>{children}</span>
    </button>
  );
}

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type StatBarProps = {
  value: number;
  label?: string;
  colorClass?: string;
  className?: string;
};

export function StatBar({ value, label, colorClass = "bg-primary", className }: StatBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className={cn("h-full rounded-full", colorClass)}
          animate={{ width: `${clamped}%` }}
          transition={{ type: "spring", stiffness: 80, damping: 18 }}
        />
      </div>
    </div>
  );
}

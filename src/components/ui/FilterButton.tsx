import { useEffect, useRef, useState } from "react";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

type FilterOption<T extends string> = {
  value: T;
  label: string;
};

type FilterButtonProps<T extends string> = {
  options: FilterOption<T>[];
  value: T;
  defaultValue: T;
  onChange: (value: T) => void;
  className?: string;
};

export function FilterButton<T extends string>({
  options,
  value,
  defaultValue,
  onChange,
  className,
}: FilterButtonProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isDefault = value === defaultValue;
  const activeLabel = options.find((o) => o.value === value)?.label;

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={isDefault ? "Filter" : `Filter: ${activeLabel}. Clear filter`}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-7 items-center gap-1 rounded-full border px-2 text-xs font-semibold transition-colors",
          isDefault
            ? "border-[var(--line-soft)] bg-transparent text-[var(--ink-3)] hover:bg-[var(--bg-card)]"
            : "border-transparent bg-[var(--ink-1)] text-[var(--ink-on-dark)]",
        )}
      >
        <SlidersHorizontal className="h-3 w-3 shrink-0" aria-hidden="true" />
        {!isDefault && (
          <>
            <span className="max-w-[80px] truncate">{activeLabel}</span>
            <span
              aria-hidden="true"
              className="ml-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                onChange(defaultValue);
                setOpen(false);
              }}
            >
              <X className="h-2.5 w-2.5" />
            </span>
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-paper)] shadow-[var(--shadow-card)]">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-card)]",
                opt.value === value
                  ? "font-semibold text-[var(--ink-1)]"
                  : "text-[var(--ink-2)]",
              )}
            >
              <span className="flex-1">{opt.label}</span>
              {opt.value === value && (
                <Check className="h-3.5 w-3.5 shrink-0 text-[var(--ink-1)]" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

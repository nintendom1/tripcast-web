import { Slider } from "@base-ui/react/slider";
import { cn } from "../../lib/utils";

interface RangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onValueChange: (value: [number, number]) => void;
  className?: string;
}

export function RangeSlider({
  min,
  max,
  value,
  onValueChange,
  className,
}: RangeSliderProps) {
  return (
    <Slider.Root
      min={min}
      max={max}
      value={value}
      onValueChange={(val) => onValueChange(val as [number, number])}
      className={cn("relative flex w-full touch-none items-center py-4", className)}
    >
      <Slider.Track className="relative h-1.5 w-full grow rounded-full bg-[var(--meter-track)]">
        <Slider.Indicator className="absolute h-full rounded-full bg-[var(--flag)]" />
      </Slider.Track>
      <Slider.Thumb
        index={0}
        className="block h-4 w-4 rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--flag)]"
        aria-label="Start range"
      />
      <Slider.Thumb
        index={1}
        className="block h-4 w-4 rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--flag)]"
        aria-label="End range"
      />
    </Slider.Root>
  );
}

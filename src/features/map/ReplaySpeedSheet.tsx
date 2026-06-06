import { Sheet, SheetContent, SheetTitle } from "../../components/ui/sheet";
import { cn } from "../../lib/utils";

export interface ReplaySpeedSheetProps {
  open: boolean;
  /** Currently selected playback speed. */
  speed: number;
  /** Discrete speeds to offer, in display order. */
  options: readonly number[];
  onSelect: (speed: number) => void;
  onClose: () => void;
}

/**
 * Bottom sheet for picking a discrete Replay playback speed. Mirrors the design
 * mockup's speed modal: a drag handle, title, and a row of pill buttons. Styling
 * is token-driven; the selected pill uses the brand `--flag` color.
 */
export default function ReplaySpeedSheet({
  open,
  speed,
  options,
  onSelect,
  onClose,
}: ReplaySpeedSheetProps) {
  return (
    <Sheet
      open={open}
      modal={false}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showBackdrop={false}
        className="z-[60] mx-auto max-w-md gap-5 rounded-t-xl px-5 pb-8 pt-3"
        aria-label="Replay speed"
      >
        <div className="mx-auto h-1 w-12 rounded-full bg-[var(--line-soft)]" aria-hidden="true" />
        <SheetTitle className="text-center text-base font-semibold text-[var(--ink-1)]">
          Speed
        </SheetTitle>
        <div className="flex items-center gap-1 rounded-full bg-[var(--meter-track)] p-1">
          {options.map((option) => {
            const selected = option === speed;
            return (
              <button
                key={option}
                type="button"
                onClick={() => onSelect(option)}
                aria-pressed={selected}
                className={cn(
                  "flex-1 rounded-full py-2 text-sm font-semibold transition-colors",
                  selected
                    ? "bg-[var(--flag)] text-[var(--ink-on-brand)] shadow-sm"
                    : "text-[var(--ink-2)] hover:bg-[var(--bg-paper)]",
                )}
              >
                {option}x
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

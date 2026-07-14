import { Sheet, SheetContent, SheetTitle } from "../../components/ui/sheet";

export type ReplaySettingsSheetProps = {
  open: boolean;
  speed: number;
  onChangeSource: () => void;
  onChangeSpeed: () => void;
  onRestart: () => void;
  onExit: () => void;
  onClose: () => void;
};

export default function ReplaySettingsSheet({ open, speed, onChangeSource, onChangeSpeed, onRestart, onExit, onClose }: ReplaySettingsSheetProps) {
  return (
    <Sheet open={open} modal={false} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="bottom" showBackdrop={false} className="z-[60] mx-auto max-w-md gap-4 rounded-t-xl px-5 pb-8 pt-3" aria-label="Replay settings">
        <div className="mx-auto h-1 w-12 rounded-full bg-[var(--line-soft)]" aria-hidden="true" />
        <SheetTitle className="text-center text-base font-semibold text-[var(--ink-1)]">Replay Settings</SheetTitle>
        <div className="grid gap-2">
          <button type="button" onClick={onChangeSource} className="rounded-xl bg-[var(--meter-track)] px-4 py-3 text-left text-sm font-semibold">Change source</button>
          <button type="button" onClick={onChangeSpeed} className="rounded-xl bg-[var(--meter-track)] px-4 py-3 text-left text-sm font-semibold">Speed <span className="float-right text-[var(--ink-3)]">{speed}x</span></button>
          <button type="button" onClick={onRestart} className="rounded-xl bg-[var(--meter-track)] px-4 py-3 text-left text-sm font-semibold">Restart Replay</button>
          <button type="button" onClick={onExit} className="rounded-xl bg-[var(--bg-danger)] px-4 py-3 text-left text-sm font-semibold text-[var(--ink-danger)]">End Replay</button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

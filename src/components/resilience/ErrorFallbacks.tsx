import type { FallbackProps } from "react-error-boundary";

import { Button } from "../ui/button";

type FullScreenErrorFallbackProps = FallbackProps & {
  title?: string;
  message?: string;
};

export function FullScreenErrorFallback({
  resetErrorBoundary,
  title = "TripCast hit a problem.",
  message = "Try again, or reload the app if the problem keeps happening.",
}: FullScreenErrorFallbackProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--bg-paper)] px-4">
      <div role="alert" className="grid w-full max-w-sm gap-4 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] p-5 shadow-lg">
        <div className="grid gap-1">
          <h1 className="text-lg font-semibold text-[var(--ink-1)]">{title}</h1>
          <p className="text-sm text-[var(--ink-3)]">{message}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={resetErrorBoundary}>
            Retry
          </Button>
          <Button type="button" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        </div>
      </div>
    </div>
  );
}

type FeatureErrorFallbackProps = FallbackProps & {
  title?: string;
  message?: string;
  onClose?: () => void;
  className?: string;
};

export function FeatureErrorFallback({
  resetErrorBoundary,
  title = "This feature hit a problem.",
  message = "Try again, or close this panel and come back.",
  onClose,
  className,
}: FeatureErrorFallbackProps) {
  return (
    <div
      role="alert"
        className={
          className ??
        "grid gap-3 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 text-sm shadow-lg backdrop-blur-sm"
      }
    >
      <div className="grid gap-1">
        <p className="font-medium text-[var(--ink-1)]">{title}</p>
        <p className="text-[var(--ink-3)]">{message}</p>
      </div>
      <div className="flex justify-end gap-2">
        {onClose ? (
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        ) : null}
        <Button type="button" size="sm" onClick={resetErrorBoundary}>
          Retry
        </Button>
      </div>
    </div>
  );
}

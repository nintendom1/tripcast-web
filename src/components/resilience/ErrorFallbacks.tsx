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
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 px-4">
      <div role="alert" className="grid w-full max-w-sm gap-4 rounded-md border bg-background p-5 shadow-lg">
        <div className="grid gap-1">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
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
        "grid gap-3 rounded-md border bg-background/95 p-3 text-sm shadow-lg backdrop-blur-sm"
      }
    >
      <div className="grid gap-1">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{message}</p>
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

import type { ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";

import { FeatureErrorFallback } from "./ErrorFallbacks";

// Future LLM note: Use react-error-boundary for React render, lazy import, and Convex useQuery thrown-error containment.
// It does not replace delayed pending/offline UI or local try/catch for async mutations and event handlers.
type FeatureBoundaryProps = {
  children: ReactNode;
  fallbackClassName?: string;
  message?: string;
  onClose?: () => void;
  resetKeys?: unknown[];
  title?: string;
};

export function FeatureBoundary({
  children,
  fallbackClassName,
  message,
  onClose,
  resetKeys,
  title,
}: FeatureBoundaryProps) {
  return (
    <ErrorBoundary
      resetKeys={resetKeys}
      fallbackRender={(props) => (
        <FeatureErrorFallback
          {...props}
          title={title}
          message={message}
          onClose={onClose}
          className={fallbackClassName}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

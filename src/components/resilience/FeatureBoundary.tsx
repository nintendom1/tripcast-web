import type { ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";

import { log as debugLog } from "../../debug/debugLogger";
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
      onError={(error, info) => {
        try {
          const err = error instanceof Error ? error : null;
          debugLog("error", "FeatureBoundary", "react:feature-boundary-error", "error", {
            title,
            message: err?.message ?? String(error),
            name: err?.name ?? typeof error,
            stack: err?.stack?.slice(0, 400),
            componentStack: info.componentStack?.slice(0, 400),
          });
        } catch { /* logging must not break the fallback */ }
      }}
      fallbackRender={(props) => (
        <FeatureErrorFallback
          {...props}
          resetErrorBoundary={() => {
            try {
              debugLog("info", "FeatureBoundary", "feature:fallback:retry", "error", { title });
            } catch { /* logging must not break the fallback */ }
            props.resetErrorBoundary();
          }}
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

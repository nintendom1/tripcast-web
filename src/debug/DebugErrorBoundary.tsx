import { Component, type ErrorInfo, type ReactNode } from "react";
import { debugLoggerFor } from "./useDebugLogger";

const logger = debugLoggerFor("DebugErrorBoundary", "src/debug/DebugErrorBoundary.tsx");

interface Props {
  children: ReactNode;
}

interface State {
  caughtError: Error | null;
}

/**
 * Logs React render errors into the debug log, then re-throws the original
 * error so the upstream react-error-boundary still shows the fullscreen fallback.
 */
export default class DebugErrorBoundary extends Component<Props, State> {
  state: State = { caughtError: null };

  static getDerivedStateFromError(error: Error): State {
    return { caughtError: error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error("react:render-error", "error", {
      message: error.message,
      name: error.name,
      stack: error.stack?.slice(0, 400),
      componentStack: info.componentStack?.slice(0, 400),
    });
  }

  render(): ReactNode {
    if (this.state.caughtError) {
      // Re-throw original error — caught by the outer react-error-boundary
      throw this.state.caughtError;
    }
    return this.props.children;
  }
}

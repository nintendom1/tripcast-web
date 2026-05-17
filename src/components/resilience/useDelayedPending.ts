import { useEffect, useState } from "react";

export function useDelayedPending(isPending: boolean, delayMs = 5000, resetKey?: unknown) {
  const [isDelayed, setIsDelayed] = useState(false);

  useEffect(() => {
    if (!isPending) {
      setIsDelayed(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setIsDelayed(true), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, isPending, resetKey]);

  return isDelayed;
}

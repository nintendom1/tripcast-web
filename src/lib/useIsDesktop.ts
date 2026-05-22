import { useEffect, useState } from "react";

export const DESKTOP_MIN_WIDTH = 960;
const DESKTOP_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`;

/**
 * Returns true when the viewport is ≥ 960px wide (desktop breakpoint).
 * Updates reactively on window resize via matchMedia.
 */
export function useIsDesktop(): boolean {
  const [match, setMatch] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(DESKTOP_QUERY).matches,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(DESKTOP_QUERY);
    const handler = (e: MediaQueryListEvent) => setMatch(e.matches);
    mq.addEventListener("change", handler);
    setMatch(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return match;
}

import { useEffect, useState } from "react";

/**
 * Desktop breakpoint — the viewport width at which TripCast's chrome stops
 * being phone-shaped and starts looking comically wide on a monitor.
 *
 * Matches the design handoff's desktop stage (handoff renders the prototype
 * at a 960px-wide frame); chosen to be below typical tablet landscape so
 * iPad-class screens get the desktop treatment.
 */
export const DESKTOP_MIN_WIDTH = 960;

/**
 * Reactive `matchMedia('(min-width: 960px)')` subscription. Returns `false`
 * during SSR / first-render-before-effect; the post-mount effect resolves to
 * the live value and re-renders.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
    const onChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsDesktop(event.matches);
    };
    onChange(mql);

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // Older Safari fallback — keep the runtime resilient against the API gap.
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return isDesktop;
}

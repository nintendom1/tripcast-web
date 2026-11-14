import { useEffect, useState } from "react";

/**
 * Pixels the on-screen keyboard (or anything else) hides at the bottom of the layout viewport, read from
 * `window.visualViewport`. Added to a sheet's bottom padding, it lets the lowest fields and buttons scroll above the
 * keyboard. 0 where the API is missing or nothing is hidden.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}

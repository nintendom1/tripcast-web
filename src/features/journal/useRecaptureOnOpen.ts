import { useEffect, useState } from "react";

/**
 * For a write hook that lives in a component which stays mounted while its form is closed: re-captures that hook's
 * trip (`useTripMutation(...).recapture`, `useTripConvex().recapture`) when `key` becomes truthy or changes while
 * truthy (the form opens, or the sheet is reused for another item), never on other renders.
 *
 * The first render that shows the open form already has the new target (no frame with the old title, nothing to
 * submit before it): the re-capture runs during that render. The hooks read the trip from the last committed
 * render, so when the view changed in that very render the effect re-captures once more after the commit.
 */
export function useRecaptureOnOpen(key: string | number | boolean | null | undefined, recapture: () => void): void {
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    if (key) recapture();
  }
  useEffect(() => {
    if (key) recapture();
  }, [key, recapture]);
}

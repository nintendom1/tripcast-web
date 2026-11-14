// One bottom pane at a time. The Trips pane (owned by the top-bar logo) and the map's Dock panes (owned by TripMap)
// live in different trees, so each side announces its own opening here and closes itself when the other side opens.
// Stateless: nothing is remembered between announcements.

export type PaneOwner = "trips" | "map";

type Listener = (owner: PaneOwner) => void;

const listeners = new Set<Listener>();

/** Tells every listener that `owner`'s pane has just opened. */
export function announcePaneOpened(owner: PaneOwner): void {
  [...listeners].forEach((listener) => listener(owner));
}

/** Calls `listener` on every announcement until the returned function is called. */
export function subscribePaneOpened(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

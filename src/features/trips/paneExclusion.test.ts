import { describe, expect, it, vi } from "vitest";

import { announcePaneOpened, subscribePaneOpened } from "./paneExclusion";

describe("paneExclusion", () => {
  it("tells every listener which side opened a pane, until it unsubscribes", () => {
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = subscribePaneOpened(first);
    const stopSecond = subscribePaneOpened(second);

    announcePaneOpened("trips");
    announcePaneOpened("map");
    expect(first.mock.calls).toEqual([["trips"], ["map"]]);
    expect(second.mock.calls).toEqual([["trips"], ["map"]]);

    stopFirst();
    announcePaneOpened("trips");
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(3);
    stopSecond();
  });

  it("remembers nothing: a listener added after an announcement does not hear it", () => {
    announcePaneOpened("map");
    const late = vi.fn();
    const stop = subscribePaneOpened(late);
    expect(late).not.toHaveBeenCalled();
    stop();
  });

  it("a listener that unsubscribes while being told does not stop the others hearing it", () => {
    const heard: string[] = [];
    const stopSelf = subscribePaneOpened(() => {
      heard.push("self");
      stopSelf();
    });
    const stopOther = subscribePaneOpened(() => heard.push("other"));
    announcePaneOpened("trips");
    announcePaneOpened("trips");
    expect(heard).toEqual(["self", "other", "other"]);
    stopOther();
  });
});

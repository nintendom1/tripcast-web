import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Doc } from "../../convex/tripcastApi";
import { MessagingSheet } from "./MessagingSheet";

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
}));

vi.mock("../../components/ui/sheet", async () => {
  const React = await import("react");
  return {
    Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? React.createElement("div", null, children) : null,
    SheetContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
    SheetTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) =>
      React.createElement("h2", props, children),
    SheetCloseButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement("button", { type: "button", ...props }, "Close"),
  };
});

function makeMessage(overrides: Partial<Doc<"messages">>): Doc<"messages"> {
  return {
    _id: "message-1",
    _creationTime: 1000,
    text: "Hello",
    authorName: "Test User",
    role: "follower",
    ...overrides,
  };
}

describe("MessagingSheet", () => {
  let originalScrollTo: typeof HTMLElement.prototype.scrollTo;

  beforeEach(() => {
    originalScrollTo = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => 400,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 1000,
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(performance.now()), 0);
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      window.clearTimeout(id);
    });
  });

  afterEach(() => {
    HTMLElement.prototype.scrollTo = originalScrollTo;
    vi.unstubAllGlobals();
  });

  it("renders the new-message divider before the first unread message and marks read after positioning", async () => {
    const onMarkRead = vi.fn();
    const messages = [
      makeMessage({ _id: "read", _creationTime: 900, text: "Read", authorId: "other-user" }),
      makeMessage({ _id: "first-unread", _creationTime: 1200, text: "First unread", authorId: "other-user" }),
      makeMessage({ _id: "latest-unread", _creationTime: 1400, text: "Latest unread", authorId: "another-user" }),
    ];

    const { container } = render(
      <MessagingSheet
        open
        onOpenChange={vi.fn()}
        messages={messages}
        token="token"
        userId="viewer-user"
        sessionId="viewer-session"
        role="follower"
        lastReadAt={1000}
        onMarkRead={onMarkRead}
      />,
    );

    expect(screen.getByText("New since last read")).toBeInTheDocument();
    expect(container.querySelector('[data-scroll-anchor="first-unread"]')).toBeInTheDocument();
    expect(container.querySelector('[data-scroll-anchor="latest-unread"]')).not.toBeInTheDocument();
    await waitFor(() => expect(onMarkRead).toHaveBeenCalled());
  });

  it("places the current follower's messages on the right and other follower messages on the left", () => {
    const messages = [
      makeMessage({
        _id: "mine",
        _creationTime: 1200,
        text: "My message",
        authorId: "legacy-user",
        triggeredBySessionId: "viewer-session",
      }),
      makeMessage({
        _id: "theirs",
        _creationTime: 1300,
        text: "Other follower",
        authorId: "other-user",
      }),
    ];

    const { container } = render(
      <MessagingSheet
        open
        onOpenChange={vi.fn()}
        messages={messages}
        token="token"
        userId="viewer-user"
        sessionId="viewer-session"
        role="follower"
        lastReadAt={0}
        onMarkRead={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-message-id="mine"]')).toHaveClass("justify-end");
    expect(container.querySelector('[data-message-id="theirs"]')).toHaveClass("justify-start");
  });

  it("marks newly arriving messages read while the sheet is already open", async () => {
    const onMarkRead = vi.fn();
    const firstMessages = [
      makeMessage({ _id: "first", _creationTime: 1200, text: "First", authorId: "other-user" }),
    ];
    const { rerender } = render(
      <MessagingSheet
        open
        onOpenChange={vi.fn()}
        messages={firstMessages}
        token="token"
        userId="viewer-user"
        sessionId="viewer-session"
        role="follower"
        lastReadAt={1000}
        onMarkRead={onMarkRead}
      />,
    );

    await waitFor(() => expect(onMarkRead).toHaveBeenCalledTimes(1));
    onMarkRead.mockClear();

    rerender(
      <MessagingSheet
        open
        onOpenChange={vi.fn()}
        messages={[
          ...firstMessages,
          makeMessage({ _id: "second", _creationTime: 1400, text: "Second", authorId: "other-user" }),
        ]}
        token="token"
        userId="viewer-user"
        sessionId="viewer-session"
        role="follower"
        lastReadAt={1200}
        onMarkRead={onMarkRead}
      />,
    );

    await waitFor(() => expect(onMarkRead).toHaveBeenCalledTimes(1));
  });
});

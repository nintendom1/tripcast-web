import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, Trash2, Info } from "lucide-react";
import { useMutation } from "convex/react";
import { tripcastApi, type Doc, type Role } from "../../convex/tripcastApi";
import { Sheet, SheetContent, SheetTitle, SheetCloseButton } from "../../components/ui/sheet";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useTheme } from "../../providers/ThemeProvider";
import { cn } from "../../lib/utils";
import { findNewestUnreadMessage, findOldestUnreadMessage, isOwnChatMessage } from "./messagingRules";

const CHAT_PALETTES = {
  meadow: {
    accent: "#4da699",
    headerBg: "rgba(77, 166, 153, 0.1)",
    followerBubble: "#4da699",
    travelerBubble: "#6fa3d1",
    bubbleText: "var(--ink-1)",
  },
  constellation: {
    accent: "var(--green)",
    headerBg: "color-mix(in oklab, var(--green) 16%, transparent)",
    followerBubble: "var(--green)",
    travelerBubble: "var(--teal)",
    bubbleText: "var(--ink-on-brand)",
  },
} as const;

type ChatPalette = typeof CHAT_PALETTES[keyof typeof CHAT_PALETTES];

type OpenScrollPlan = {
  targetMessageId: string;
  dividerMessageId: string | null;
  latestMessageId: string | null;
};

interface MessagingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: Doc<"messages">[];
  token: string;
  userId?: string;
  sessionId?: string;
  role: Role;
  lastReadAt: number;
  onMarkRead: () => void;
  onNavigateToItem?: (type: string, id: string) => void;
}

export function MessagingSheet({
  open,
  onOpenChange,
  messages,
  token,
  userId,
  sessionId,
  role,
  lastReadAt,
  onMarkRead,
  onNavigateToItem
}: MessagingSheetProps) {
  const log = useDebugLogger("MessagingSheet", "src/features/messaging/MessagingSheet.tsx");
  const music = useMusicSafe();
  const { resolvedTheme } = useTheme();
  const palette = CHAT_PALETTES[resolvedTheme];
  const sendMessage = useMutation(tripcastApi.messages.sendMessage);
  const deleteMessage = useMutation(tripcastApi.messages.deleteMessage);
  
  const [inputText, setInputText] = useState("");
  const [dividerBeforeMessageId, setDividerBeforeMessageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasInitialScrolled = useRef(false);
  const lastSeenMessageIdRef = useRef<string | null>(null);
  const openScrollPlanRef = useRef<OpenScrollPlan | null>(null);
  const openScrollFrameRef = useRef<number | null>(null);
  const wasNearBottomRef = useRef(true);

  // Play unique sound blips on message arrival
  const lastMsgIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    
    // Skip sound on initial load
    if (lastMsgIdRef.current === null) {
      lastMsgIdRef.current = lastMsg._id;
      return;
    }
    if (lastMsg._id === lastMsgIdRef.current) return;
    lastMsgIdRef.current = lastMsg._id;

    const isOwnMsg = isOwnChatMessage(lastMsg, userId, role, sessionId);
    
    if (isOwnMsg) {
      music.sfx("tap");
    } else if (lastMsg.role === "system") {
      music.sfx("toast");
    } else if (lastMsg.role === "traveler") {
      music.sfx("success");
    } else {
      music.sfx("pin");
    }
  }, [messages, role, userId, sessionId, music]);

  useEffect(() => {
    if (open) return;
    if (openScrollFrameRef.current !== null) {
      cancelAnimationFrame(openScrollFrameRef.current);
      openScrollFrameRef.current = null;
    }
    openScrollPlanRef.current = null;
    hasInitialScrolled.current = false;
    lastSeenMessageIdRef.current = null;
    wasNearBottomRef.current = true;
    setDividerBeforeMessageId(null);
  }, [open]);

  useEffect(() => {
    if (!open || messages.length === 0 || hasInitialScrolled.current || openScrollPlanRef.current) return;

    const plan = createOpenScrollPlan(messages, lastReadAt, userId, role, sessionId);
    if (!plan) return;

    openScrollPlanRef.current = plan;
    setDividerBeforeMessageId(plan.dividerMessageId);
  }, [open, messages, lastReadAt, role, userId, sessionId]);

  useEffect(() => {
    if (!open || hasInitialScrolled.current) return;
    const plan = openScrollPlanRef.current;
    if (!plan) return;
    const planForScroll = plan;

    let attempts = 0;
    const maxAttempts = 30;

    function tryPosition() {
      attempts += 1;
      const container = scrollRef.current;
      const target = container ? findScrollTarget(container, planForScroll) : null;

      if (container && target && container.clientHeight > 0) {
        const containerRect = container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const targetTop = container.scrollTop + targetRect.top - containerRect.top;
        container.scrollTop = Math.max(0, targetTop);

        hasInitialScrolled.current = true;
        lastSeenMessageIdRef.current = planForScroll.latestMessageId;
        wasNearBottomRef.current = isNearBottom(container);
        openScrollFrameRef.current = null;
        onMarkRead();
        return;
      }

      if (attempts < maxAttempts) {
        openScrollFrameRef.current = requestAnimationFrame(tryPosition);
      } else {
        openScrollFrameRef.current = null;
      }
    }

    openScrollFrameRef.current = requestAnimationFrame(tryPosition);
    return () => {
      if (openScrollFrameRef.current !== null) {
        cancelAnimationFrame(openScrollFrameRef.current);
        openScrollFrameRef.current = null;
      }
    };
  }, [open, messages, dividerBeforeMessageId, onMarkRead]);

  useEffect(() => {
    if (!open || messages.length === 0 || !hasInitialScrolled.current) return;

    const lastMsg = messages[messages.length - 1];
    if (lastSeenMessageIdRef.current === lastMsg._id) return;
    lastSeenMessageIdRef.current = lastMsg._id;

    const container = scrollRef.current;
    if (!container) return;

    const isOwn = isOwnChatMessage(lastMsg, userId, role, sessionId);
    const shouldFollowNewMessage = isOwn || wasNearBottomRef.current || isNearBottom(container);
    onMarkRead();

    if (shouldFollowNewMessage) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      wasNearBottomRef.current = true;
    } else {
      wasNearBottomRef.current = false;
    }
  }, [open, messages, role, userId, sessionId, onMarkRead]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!inputText.trim()) return;
    
    const text = inputText;
    setInputText("");
    log.logMutation("messages:sendMessage");
    try {
      await sendMessage({ token, text });
    } catch (err: any) {
      log.error("messages:sendMessage:error", "mutation", { message: err.message });
    }
  }

  return (
    <Sheet open={open} modal={false} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showBackdrop={false}
        mapAdjacent
        className="z-[10] flex max-h-[70dvh] min-h-0 flex-col rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
      >
        <div aria-hidden="true" className="absolute left-0 right-0 top-0 h-1 rounded-t-xl" style={{ background: palette.accent }} />
        <div
          className="flex items-start justify-between gap-2 border-b border-[var(--line-soft)] px-4 pb-3 pt-2"
          style={{ background: `linear-gradient(180deg, ${palette.headerBg} 0%, var(--bg-paper) 100%)` }}
        >
          <div className="flex items-center gap-2">
            <span
              className="grid h-8 w-8 place-items-center rounded-full shadow-sm"
              style={{ background: palette.accent, color: palette.bubbleText }}
            >
              <MessageSquare className="h-4 w-4" />
            </span>
            <SheetTitle className="font-[var(--font-display)] text-xl font-extrabold tracking-tight text-[var(--ink-1)]">
              Trip Chat
            </SheetTitle>
          </div>
          <SheetCloseButton />
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4"
          onScroll={(event) => {
            wasNearBottomRef.current = isNearBottom(event.currentTarget);
          }}
        >
          {messages.map((msg) => (
            <React.Fragment key={msg._id}>
              {dividerBeforeMessageId === msg._id ? <LastReadDivider messageId={msg._id} /> : null}
              <MessageItem
                msg={msg}
                isOwn={isOwnChatMessage(msg, userId, role, sessionId)}
                isViewerTraveler={role === "traveler"}
                palette={palette}
                onDelete={() => deleteMessage({ token, messageId: msg._id })}
                onNavigate={onNavigateToItem}
              />
            </React.Fragment>
          ))}
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center py-12">
              <p className="text-sm italic text-[var(--ink-3)]">No messages yet. Say hello!</p>
            </div>
          )}
        </div>

        <form onSubmit={handleSend} className="border-t border-[var(--line-soft)] bg-[var(--bg-card)] p-4 pb-[calc(100px + env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value.slice(0, 500))}
              placeholder="Type a message..."
              className="flex-1 rounded-full border border-[var(--line-soft)] bg-[var(--bg-paper)] px-4 py-2 text-sm text-[var(--ink-1)] outline-none placeholder:text-[var(--ink-3)] focus:border-[var(--flag)] focus:ring-2 focus:ring-[var(--flag)]"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="grid h-10 w-10 place-items-center rounded-full shadow-sm transition-opacity disabled:opacity-50"
              style={{ background: palette.accent, color: palette.bubbleText }}
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function createOpenScrollPlan(
  messages: Doc<"messages">[],
  lastReadAt: number,
  userId: string | undefined,
  role: Role,
  sessionId: string | undefined,
): OpenScrollPlan | null {
  const latestMessage = messages.at(-1) ?? null;
  if (!latestMessage) return null;

  const canUseUnreadRules = Boolean(userId || sessionId || role === "traveler");
  const unreadAnchor = canUseUnreadRules
    ? findNewestUnreadMessage(messages, lastReadAt, userId, role, sessionId)
    : null;
  const unreadBoundary = canUseUnreadRules
    ? findOldestUnreadMessage(messages, lastReadAt, userId, role, sessionId)
    : null;
  const timestampAnchor = !unreadBoundary && lastReadAt > 0
    ? findOldestMessageAfter(messages, lastReadAt)
    : null;
  const dividerAnchor = unreadBoundary ?? timestampAnchor;
  const targetMessage = unreadAnchor ?? timestampAnchor ?? latestMessage;

  return {
    targetMessageId: targetMessage._id,
    dividerMessageId: dividerAnchor?._id ?? null,
    latestMessageId: latestMessage._id,
  };
}

function findOldestMessageAfter(messages: Doc<"messages">[], lastReadAt: number) {
  return messages.reduce<Doc<"messages"> | null>((oldest, message) => {
    if (message._creationTime <= lastReadAt) return oldest;
    if (!oldest || message._creationTime < oldest._creationTime) return message;
    return oldest;
  }, null);
}

function isNearBottom(container: HTMLElement) {
  return container.scrollHeight - container.scrollTop - container.clientHeight < 160;
}

function findScrollTarget(container: HTMLElement, plan: OpenScrollPlan) {
  if (plan.dividerMessageId) {
    const divider = Array.from(container.querySelectorAll<HTMLElement>("[data-scroll-anchor]"))
      .find((element) => element.dataset.scrollAnchor === plan.dividerMessageId);
    if (divider) return divider;
  }

  return Array.from(container.querySelectorAll<HTMLElement>("[data-message-id]"))
    .find((element) => element.dataset.messageId === plan.targetMessageId) ?? null;
}

function LastReadDivider({ messageId }: { messageId: string }) {
  return (
    <div
      className="flex items-center gap-2 py-2"
      role="separator"
      aria-label="New since last read"
      data-scroll-anchor={messageId}
    >
      <span className="h-px flex-1 bg-[var(--line-soft)]" />
      <span className="rounded-full border border-[var(--line-soft)] bg-[var(--bg-paper)] px-2.5 py-1 font-[var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] shadow-sm">
        New since last read
      </span>
      <span className="h-px flex-1 bg-[var(--line-soft)]" />
    </div>
  );
}

function MessageItem({ msg, isOwn, isViewerTraveler, palette, onDelete, onNavigate }: {
  msg: Doc<"messages">; 
  isOwn: boolean; 
  isViewerTraveler: boolean;
  palette: ChatPalette;
  onDelete: () => void;
  onNavigate?: (type: string, id: string) => void;
}) {
  if (msg.role === "system") {
    return (
      <div 
        id={`msg-${msg._id}`}
        data-message-id={msg._id}
        onClick={() => msg.associatedType && msg.associatedId && onNavigate?.(msg.associatedType, msg.associatedId as string)}
        className={cn(
          "relative mx-auto max-w-[90%] rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 text-center shadow-sm transition-colors",
          msg.associatedId && "cursor-pointer hover:bg-[var(--meter-track)]"
        )}
      >
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <Info className="h-3 w-3 text-[var(--ink-3)]" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-3)]">App Update</span>
        </div>
        <p className="text-sm text-[var(--ink-1)]">{msg.text}</p>
        {msg.targetUserId && (
          <p className="mt-1.5 text-[10px] italic text-[var(--ink-3)]">
            Seen only by you {isViewerTraveler ? "and Traveler" : "and the Traveler"}
          </p>
        )}
      </div>
    );
  }

  const coloredBubbleStyle = msg.role === "traveler"
    ? { backgroundColor: palette.travelerBubble, color: palette.bubbleText }
    : { backgroundColor: palette.followerBubble, color: palette.bubbleText };

  return (
    <div
      id={`msg-${msg._id}`}
      data-message-id={msg._id}
      className={cn("flex w-full group", isOwn ? "justify-end" : "justify-start")}
    >
      <div className={cn("max-w-[80%] space-y-1", isOwn ? "items-end" : "items-start")}>
        {!isOwn && (
          <div className="flex items-center gap-2 ml-2">
            <span className="text-[11px] font-bold text-[var(--ink-2)]">{msg.authorName}</span>
            <span className="text-[9px] text-[var(--ink-3)]/60">{new Date(msg._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
        <div className="flex items-end gap-2">
          {(isOwn || isViewerTraveler) && (
            <button
              onClick={onDelete}
              className="mb-1 opacity-0 group-hover:opacity-100 p-1 text-[var(--ink-3)] hover:text-[var(--ink-danger)] transition-opacity"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <div
            className={cn(
              "rounded-2xl px-3 py-1.5 text-sm shadow-sm break-all",
              isOwn 
                ? "rounded-tr-none"
                : (msg.role === 'traveler' ? "rounded-tl-none" : "bg-[var(--bg-card)] text-[var(--ink-1)] border border-[var(--line-soft)] rounded-tl-none")
            )}
            style={isOwn 
              ? coloredBubbleStyle
              : (msg.role === 'traveler' ? coloredBubbleStyle : {})}
          >
            {msg.text}
            {isOwn && (
              <div className="mt-0.5 text-right">
                <span className="text-[9px] opacity-70">
                  {new Date(msg._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, Trash2, Info } from "lucide-react";
import { useMutation } from "convex/react";
import { tripcastApi, type Doc } from "../../convex/tripcastApi";
import { Sheet, SheetContent, SheetTitle, SheetCloseButton } from "../../components/ui/sheet";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useMusicSafe } from "../../providers/MusicProvider";
import { cn } from "../../lib/utils";

const MESSAGING_PERSONALITY = {
  color: "#4da699", // Sage-teal
  bg: "rgba(77, 166, 153, 0.1)",
};

const TRAVELER_COLOR = "#6fa3d1"; // Soft Slate-Blue


interface MessagingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: Doc<"messages">[];
  token: string;
  userId?: string;
  role: string;
  lastReadAt: number;
  onNavigateToItem?: (type: string, id: string) => void;
}

export function MessagingSheet({
  open,
  onOpenChange,
  messages,
  token,
  userId,
  role,
  lastReadAt,
  onNavigateToItem
}: MessagingSheetProps) {
  const log = useDebugLogger("MessagingSheet", "src/features/messaging/MessagingSheet.tsx");
  const music = useMusicSafe();
  const sendMessage = useMutation(tripcastApi.messages.sendMessage);
  const deleteMessage = useMutation(tripcastApi.messages.deleteMessage);
  
  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

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

    const isOwnMsg = (role === "traveler" && lastMsg.role === "traveler") || 
                     (lastMsg.authorId !== undefined && lastMsg.authorId === userId);
    
    if (isOwnMsg) {
      music.sfx("tap");
    } else if (lastMsg.role === "system") {
      music.sfx("toast");
    } else if (lastMsg.role === "traveler") {
      music.sfx("success");
    } else {
      music.sfx("pin");
    }
  }, [messages, role, userId, music]);

  const hasInitialScrolled = useRef(false);
  useEffect(() => {
    if (!open) {
      hasInitialScrolled.current = false;
      return;
    }
    // Only scroll once data is available after opening
    if (open && messages.length > 0 && !hasInitialScrolled.current) {
      const firstUnread = messages.find(m => m._creationTime > lastReadAt);
      if (firstUnread) {
        const el = document.getElementById(`msg-${firstUnread._id}`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }
      hasInitialScrolled.current = true;
    }

    // Auto-scroll logic for new messages when already open
    if (open && messages.length > 0 && hasInitialScrolled.current) {
      const lastMsg = messages[messages.length - 1];
      const isOwn = (role === "traveler" && lastMsg.role === "traveler") || 
                    (!!userId && lastMsg.authorId === userId) ||
                    (!!userId && lastMsg.triggeredByUserId === userId);
      
      const container = scrollRef.current;
      if (container) {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
        if (isOwn || isNearBottom) {
          container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
        }
      }
    }
  }, [open, messages, lastReadAt, role, userId]);

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
        className="z-[10] flex max-h-[70dvh] flex-col rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
      >
        <div aria-hidden="true" className="absolute left-0 right-0 top-0 h-1 rounded-t-xl" style={{ background: MESSAGING_PERSONALITY.color }} />
        <div
          className="flex items-start justify-between gap-2 border-b border-[var(--line-soft)] px-4 pb-3 pt-2"
          style={{ background: `linear-gradient(180deg, ${MESSAGING_PERSONALITY.bg} 0%, var(--bg-paper) 100%)` }}
        >
          <div className="flex items-center gap-2">
            <span
              className="grid h-8 w-8 place-items-center rounded-full text-white shadow-sm"
              style={{ background: MESSAGING_PERSONALITY.color }}
            >
              <MessageSquare className="h-4 w-4" />
            </span>
            <SheetTitle className="font-[var(--font-display)] text-xl font-extrabold tracking-tight text-[var(--ink-1)]">
              Trip Chat
            </SheetTitle>
          </div>
          <SheetCloseButton />
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
          {messages.map((msg) => (
            <MessageItem 
              key={msg._id} 
              msg={msg} 
              isOwn={
                (role === "traveler" && msg.role === "traveler") || 
                (!!userId && msg.authorId === userId) ||
                (!!userId && msg.triggeredByUserId === userId)
              }
              isViewerTraveler={role === "traveler"}
              onDelete={() => deleteMessage({ token, messageId: msg._id })}
              onNavigate={onNavigateToItem}
            />
          ))}
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center py-12">
              <p className="text-sm text-muted-foreground italic">No messages yet. Say hello!</p>
            </div>
          )}
        </div>

        <form onSubmit={handleSend} className="border-t border-[var(--line-soft)] bg-[var(--bg-paper)] p-4 pb-[calc(100px + env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value.slice(0, 500))}
              placeholder="Type a message..."
              className="flex-1 rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] text-[var(--ink-1)] placeholder:text-[var(--ink-3)] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ink-1)]"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="grid h-10 w-10 place-items-center rounded-full bg-[var(--ink-1)] text-[var(--ink-on-dark)] disabled:opacity-50"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function MessageItem({ msg, isOwn, isViewerTraveler, onDelete, onNavigate }: { 
  msg: Doc<"messages">; 
  isOwn: boolean; 
  isViewerTraveler: boolean;
  onDelete: () => void;
  onNavigate?: (type: string, id: string) => void;
}) {
  if (msg.role === "system") {
    return (
      <div 
        id={`msg-${msg._id}`}
        onClick={() => msg.associatedType && msg.associatedId && onNavigate?.(msg.associatedType, msg.associatedId as string)}
        className={cn(
          "relative mx-auto max-w-[90%] rounded-lg border border-dashed border-[var(--line-strong)] bg-muted/30 p-3 text-center transition-colors",
          msg.associatedId && "cursor-pointer hover:bg-muted/50"
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

  return (
    <div id={`msg-${msg._id}`} className={cn("flex w-full group", isOwn ? "justify-end" : "justify-start")}>
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
                ? "text-[var(--ink-on-dark)] rounded-tr-none"
                : (msg.role === 'traveler' ? "text-[var(--ink-on-dark)] rounded-tl-none" : "bg-[var(--bg-card)] text-[var(--ink-1)] border border-[var(--line-soft)] rounded-tl-none")
            )}
            style={isOwn 
              ? { backgroundColor: msg.role === 'traveler' ? TRAVELER_COLOR : MESSAGING_PERSONALITY.color } 
              : (msg.role === 'traveler' ? { backgroundColor: TRAVELER_COLOR } : {})}
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
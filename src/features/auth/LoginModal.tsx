import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { cn } from "../../lib/utils";
import { useTheme } from "../../providers/ThemeProvider";
import FollowerLoginScreen from "./FollowerLoginScreen";
import AuthScreen from "./AuthScreen";
import type { StoredSession } from "../../lib/auth";

export interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignIn: (session: StoredSession) => void;
  initialView?: "follower" | "traveler";
}

export default function LoginModal({
  open,
  onOpenChange,
  onSignIn,
  initialView = "follower",
}: LoginModalProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "constellation";
  const [showTravelerLogin, setShowTravelerLogin] = React.useState(initialView === "traveler");

  React.useEffect(() => {
    if (!open) {
      const timer = window.setTimeout(
        () => setShowTravelerLogin(initialView === "traveler"),
        180,
      );
      return () => window.clearTimeout(timer);
    }
  }, [initialView, open]);

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => onOpenChange(nextOpen)}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ease-out",
            "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
          )}
        />
        <Dialog.Popup
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-3xl p-1 shadow-2xl outline-none transition duration-200 ease-out",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            isDark ? "bg-[var(--bg-paper)]" : "bg-[var(--meadow-bg)]",
          )}
        >
          <div
            className={cn(
              "relative overflow-hidden rounded-[22px] border p-6",
              isDark
                ? "border-[var(--ink-3)] bg-[var(--bg-card)]"
                : "border-[var(--meadow-paper-edge)] bg-[var(--bg-card)]",
            )}
          >
            <Dialog.Title className="sr-only">
              {showTravelerLogin ? "Traveler sign in" : "Follower sign in"}
            </Dialog.Title>
            <Dialog.Close
              className={cn(
                "absolute right-4 top-4 z-10 rounded-full p-2 transition-colors",
                isDark
                  ? "text-[var(--ink-2)] hover:bg-[var(--ink-3)]"
                  : "text-[var(--meadow-ink-soft)] hover:bg-[var(--meadow-paper-edge)]",
              )}
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>

            <div className="mt-2">
              {showTravelerLogin ? (
                <AuthScreen
                  onSignIn={(session) => onSignIn({ ...session, sessionType: "legacy" })}
                  onBack={() => setShowTravelerLogin(false)}
                />
              ) : (
                <FollowerLoginScreen
                  onSignIn={onSignIn}
                  onShowTravelerLogin={() => setShowTravelerLogin(true)}
                />
              )}
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

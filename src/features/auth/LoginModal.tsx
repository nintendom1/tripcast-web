import * as React from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "../../lib/utils";
import { useTheme } from "../../providers/ThemeProvider";
import FollowerLoginScreen from "./FollowerLoginScreen";
import AuthScreen from "./AuthScreen";
import type { StoredSession } from "../../lib/auth";

export interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignIn: (session: StoredSession) => void;
}

export default function LoginModal({
  open,
  onOpenChange,
  onSignIn,
}: LoginModalProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "constellation";
  const [showTravelerLogin, setShowTravelerLogin] = React.useState(false);

  // Reset to Follower login when modal closes
  React.useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => setShowTravelerLogin(false), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Handle escape key to close
  React.useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, onOpenChange]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={cn(
              "relative z-50 w-full max-w-[400px] rounded-3xl p-1 shadow-2xl focus:outline-none",
              isDark ? "bg-[var(--bg-paper)]" : "bg-[var(--meadow-bg)]"
            )}
          >
            <div className={cn(
              "relative overflow-hidden rounded-[22px] border p-6",
              isDark ? "border-[var(--ink-3)] bg-[var(--bg-card)]" : "border-[var(--meadow-paper-edge)] bg-[var(--bg-card)]"
            )}>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className={cn(
                  "absolute right-4 top-4 rounded-full p-2 transition-colors cursor-pointer z-10",
                  isDark ? "hover:bg-[var(--ink-3)] text-[var(--ink-2)]" : "hover:bg-[var(--meadow-paper-edge)] text-[var(--meadow-ink-soft)]"
                )}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="mt-2">
                <AnimatePresence mode="wait">
                  {showTravelerLogin ? (
                    <motion.div
                      key="traveler"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <AuthScreen
                        onSignIn={(s) => onSignIn({ ...s, sessionType: "legacy" })}
                        onBack={() => setShowTravelerLogin(false)}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="follower"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <FollowerLoginScreen
                        onSignIn={onSignIn}
                        onShowTravelerLogin={() => setShowTravelerLogin(true)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

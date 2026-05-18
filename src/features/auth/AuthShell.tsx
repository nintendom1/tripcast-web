import * as React from "react";

import { cn } from "@/lib/utils";

export interface AuthShellProps {
  /** Small uppercase kicker label above the title (e.g. "Traveler", "Welcome", "Reset"). */
  kicker?: string;
  /** Main display title — defaults to the brand wordmark. */
  title?: string;
  /** Optional subtitle / explanatory line under the title. */
  subtitle?: string;
  /** Form / action content. */
  children: React.ReactNode;
  /** Optional footer slot rendered outside the card (e.g. "Sign in as Traveler" toggle link). */
  footer?: React.ReactNode;
}

/**
 * Shared layout for the four auth screens (Traveler sign-in, Follower sign-in,
 * Invite redemption, Password reset). Renders the Trail-token chrome — paper
 * background, white card with shadow, brand mark + kicker — so each screen
 * only owns the form fields and submit logic.
 */
export default function AuthShell({
  kicker,
  title,
  subtitle,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--bg-paper)] px-4 py-8">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col items-center gap-1.5">
          <BrandMark />
          {kicker ? (
            <span className="font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-3)]">
              {kicker}
            </span>
          ) : null}
          <h1
            className={cn(
              "font-[var(--font-display)] text-2xl font-extrabold tracking-tight text-[var(--ink-1)]",
              kicker ? "" : "mt-1",
            )}
          >
            {title ?? "TripCast"}
          </h1>
          {subtitle ? (
            <p className="text-center text-sm text-[var(--ink-2)]">{subtitle}</p>
          ) : null}
        </div>
        <div className="rounded-2xl bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
          {children}
        </div>
        {footer ? <div className="flex justify-center pt-1">{footer}</div> : null}
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <span
      className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-[var(--shadow-card)]"
      style={{ background: "var(--flag)" }}
      aria-hidden="true"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 22V4 M4 4l9 4-3 4 7 3-9 3" />
      </svg>
    </span>
  );
}

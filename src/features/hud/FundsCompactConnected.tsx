import * as React from "react";
import { useQuery } from "convex/react";

import { tripcastApi, type Role } from "@/convex/tripcastApi";

import { FundsCompact } from "./FundsCompact";

function getLocalDayStart(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export interface FundsCompactConnectedProps {
  token: string;
  role: Role;
  onOpenSheet?: () => void;
  className?: string;
}

/**
 * Funds chip wired to live Convex data — Traveler hits travelerGetConfig,
 * Follower hits followerGetFundsSummary. When funds aren't enabled the
 * chip hides entirely; the StatusCard handles the empty-state messaging.
 */
export function FundsCompactConnected({
  token,
  role,
  onOpenSheet,
  className,
}: FundsCompactConnectedProps) {
  const traveler = role === "traveler";
  const currentLocalDayStart = getLocalDayStart();
  const config = useQuery(
    traveler
      ? tripcastApi.travelFunds.travelerGetConfig
      : tripcastApi.travelFunds.followerGetFundsSummary,
    { token, currentLocalDayStart },
  );

  if (config === undefined) return null;
  if (!config.enabled) return null;

  return (
    <FundsCompact
      remainingUsd={config.remainingUsd}
      startingBudgetUsd={config.startingBudgetUsd}
      budgetMode={config.budgetMode ?? "trip"}
      budgetLabel={config.budgetLabel}
      onClick={traveler && onOpenSheet ? onOpenSheet : undefined}
      className={className}
    />
  );
}

import * as React from "react";
import { useQuery } from "convex/react";

import { tripcastApi, type Role } from "@/convex/tripcastApi";

import { FundsCompact } from "./FundsCompact";

export interface FundsCompactConnectedProps {
  token: string;
  role: Role;
  onOpenSheet?: () => void;
  className?: string;
}

/**
 * Funds chip wired to live Convex data — Traveler hits travelerGetConfig,
 * Support Crew hits supportCrewGetFundsSummary. When funds aren't enabled the
 * chip hides entirely; the StatusCard handles the empty-state messaging.
 */
export function FundsCompactConnected({
  token,
  role,
  onOpenSheet,
  className,
}: FundsCompactConnectedProps) {
  const traveler = role === "traveler";
  const config = useQuery(
    traveler
      ? tripcastApi.travelFunds.travelerGetConfig
      : tripcastApi.travelFunds.supportCrewGetFundsSummary,
    { token },
  );

  if (config === undefined) return null;
  if (!config.enabled) return null;

  return (
    <FundsCompact
      remainingUsd={config.remainingUsd}
      startingBudgetUsd={config.startingBudgetUsd}
      budgetLabel={config.budgetLabel}
      onClick={traveler && onOpenSheet ? onOpenSheet : undefined}
      className={className}
    />
  );
}

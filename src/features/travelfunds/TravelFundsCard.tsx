import { useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { Role } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import TravelFundsMeter from "./TravelFundsMeter";

type TravelFundsCardProps = {
  token: string;
  role: Role;
  onOpenSheet?: () => void;
};

function TravelerTravelFundsCard({
  token,
  onOpenSheet,
}: {
  token: string;
  onOpenSheet?: () => void;
}) {
  const config = useQuery(tripcastApi.travelFunds.travelerGetConfig, { token });

  if (config === undefined) return null;

  if (!config.enabled) {
    return (
      <div
        className="w-56 rounded-lg border bg-background/95 shadow-md backdrop-blur-sm"
        aria-label="Travel Funds"
      >
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground">
          <span>💰</span>
          <span className="flex-1">Travel Funds off</span>
        </div>
        {onOpenSheet && (
          <div className="border-t px-2 py-1.5">
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs"
              onClick={onOpenSheet}
            >
              Set up
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="w-56 rounded-lg border bg-background/95 shadow-md backdrop-blur-sm"
      aria-label="Travel Funds"
    >
      <div className="px-2.5 py-2">
        <TravelFundsMeter
          startingBudgetUsd={config.startingBudgetUsd}
          remainingUsd={config.remainingUsd}
          label={config.budgetLabel}
          variant="compact"
        />
      </div>
      {onOpenSheet && (
        <div className="border-t px-2 py-1.5">
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs"
            onClick={onOpenSheet}
          >
            Manage
          </Button>
        </div>
      )}
    </div>
  );
}

function SupportCrewTravelFundsCard({ token }: { token: string }) {
  const summary = useQuery(tripcastApi.travelFunds.supportCrewGetFundsSummary, { token });

  if (summary === undefined || !summary.enabled) return null;

  return (
    <div
      className="w-56 rounded-lg border bg-background/95 shadow-md backdrop-blur-sm"
      aria-label="Travel Funds"
    >
      <div className="px-2.5 py-2">
        <TravelFundsMeter
          startingBudgetUsd={summary.startingBudgetUsd}
          remainingUsd={summary.remainingUsd}
          label={summary.budgetLabel}
          variant="compact"
        />
      </div>
    </div>
  );
}

export default function TravelFundsCard({ token, role, onOpenSheet }: TravelFundsCardProps) {
  if (role === "traveler") {
    return <TravelerTravelFundsCard token={token} onOpenSheet={onOpenSheet} />;
  }
  return <SupportCrewTravelFundsCard token={token} />;
}

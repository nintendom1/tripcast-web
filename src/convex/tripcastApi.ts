import { anyApi } from "convex/server";
import type { FunctionReference } from "convex/server";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type Role = "traveler" | "support_crew";

export type CheckpointSource = "right_click" | "tap_add_mode" | "long_press";

export type Checkpoint = {
  _id: string;
  _creationTime: number;
  title: string;
  note?: string;
  lat: number;
  lon: number;
  source: CheckpointSource;
  createdAt: number;
  updatedAt: number;
};

export type AddCheckpointArgs = {
  token: string;
  title?: string;
  note?: string;
  lat: number;
  lon: number;
  source: CheckpointSource;
};

// ---------------------------------------------------------------------------
// Route Vote types
// ---------------------------------------------------------------------------

export type RouteVoteStatus =
  | "draft"
  | "active"
  | "closed"
  | "resolved"
  | "cancelled"
  | "archived";

export type ResultsVisibility =
  | "before_voting"
  | "after_voting"
  | "after_close"
  | "traveler_only";

export type EnergyImpact = "low" | "medium" | "high";

export type CommentVisibility = "public" | "traveler_only";

export type ChallengeStatus = "planned" | "in_progress" | "completed" | "dropped";

export type TravelerLocation = { lat: number; lon: number; accuracy?: number } | null;

export type RouteVoteOptionInput = {
  title: string;
  description?: string;
  locationLabel?: string;
  lat?: number;
  lon?: number;
  estimatedCostUsd?: number;
  estimatedDurationMinutes?: number;
  estimatedEnergyImpact?: EnergyImpact;
};

export type RouteVoteOption = RouteVoteOptionInput & {
  _id: string;
  routeVoteId: string;
  createdAt: number;
  updatedAt: number;
};

export type RouteVoteSubmission = {
  _id: string;
  sessionId: string;
  selectedOptionIds: string[];
  comment?: string;
  commentVisibility: CommentVisibility;
  publicCommentHidden?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type RouteVoteListItem = {
  _id: string;
  title: string;
  description?: string;
  status: RouteVoteStatus;
  effectiveStatus: RouteVoteStatus;
  resultsVisibility: ResultsVisibility;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
  confirmedWinningOptionId?: string;
  resultingChallengeId?: string;
  options: RouteVoteOption[];
  optionVoteCounts: Record<string, number>;
  suggestedWinnerId: string | null;
  isTied: boolean;
  totalSubmissions: number;
};

export type RouteVoteDetail = RouteVoteListItem & {
  closedAt?: number;
  resolvedAt?: number;
  cancelledAt?: number;
  archivedAt?: number;
  submissions: RouteVoteSubmission[];
  challenge?: Challenge;
};

export type VisibleRouteVote = {
  _id: string;
  title: string;
  description?: string;
  effectiveStatus: RouteVoteStatus;
  resultsVisibility: ResultsVisibility;
  expiresAt: number;
  options: RouteVoteOption[];
  mySubmission?: {
    _id: string;
    selectedOptionIds: string[];
    comment?: string;
    commentVisibility: CommentVisibility;
  };
  visibleComments: Array<{
    submissionId: string;
    comment: string;
    commentVisibility: CommentVisibility;
  }>;
  optionVoteCounts?: Record<string, number>;
  totalSubmissions?: number;
};

export type RouteVoteMapOverlay = {
  travelerLocation: { lat: number; lon: number } | null;
  coordinateOptions: Array<{
    optionId: string;
    title: string;
    lat: number;
    lon: number;
  }>;
};

export type Challenge = {
  _id: string;
  title: string;
  description?: string;
  status: ChallengeStatus;
  source: "route_vote";
  sourceRouteVoteId?: string;
  sourceRouteVoteOptionId?: string;
  locationLabel?: string;
  lat?: number;
  lon?: number;
  createdAt: number;
  updatedAt: number;
};

// ---------------------------------------------------------------------------
// API namespace
// ---------------------------------------------------------------------------

export const tripcastApi = {
  auth: {
    signIn: (anyApi as any).auth.signIn as FunctionReference<
      "mutation",
      "public",
      { role: Role; code: string; clientId: string },
      { token: string; role: Role }
    >,
    currentSession: (anyApi as any).auth.currentSession as FunctionReference<
      "query",
      "public",
      { token: string },
      { role: Role } | null
    >,
    signOut: (anyApi as any).auth.signOut as FunctionReference<
      "mutation",
      "public",
      { token: string },
      null
    >,
  },
  checkpoints: {
    listCheckpoints: (anyApi as any).checkpoints.listCheckpoints as FunctionReference<
      "query",
      "public",
      { token: string },
      Checkpoint[]
    >,
    addCheckpoint: (anyApi as any).checkpoints.addCheckpoint as FunctionReference<
      "mutation",
      "public",
      AddCheckpointArgs,
      string
    >,
  },
  travelerLocations: {
    updateTravelerLocation: (anyApi as any).routeVotes.updateTravelerLocation as FunctionReference<
      "mutation",
      "public",
      { token: string; lat: number; lon: number; accuracy?: number },
      null
    >,
    getTravelerLocation: (anyApi as any).routeVotes.getTravelerLocation as FunctionReference<
      "query",
      "public",
      { token: string },
      TravelerLocation
    >,
  },
  routeVotes: {
    travelerCreateRouteVote: (anyApi as any).routeVotes.travelerCreateRouteVote as FunctionReference<
      "mutation",
      "public",
      {
        token: string;
        title: string;
        description?: string;
        expiresAt?: number;
        resultsVisibility?: ResultsVisibility;
        options: RouteVoteOptionInput[];
      },
      string
    >,
    travelerCloseRouteVote: (anyApi as any).routeVotes.travelerCloseRouteVote as FunctionReference<
      "mutation",
      "public",
      { token: string; routeVoteId: string },
      null
    >,
    travelerCancelRouteVote: (anyApi as any).routeVotes.travelerCancelRouteVote as FunctionReference<
      "mutation",
      "public",
      { token: string; routeVoteId: string },
      null
    >,
    travelerArchiveRouteVote: (anyApi as any).routeVotes.travelerArchiveRouteVote as FunctionReference<
      "mutation",
      "public",
      { token: string; routeVoteId: string },
      null
    >,
    travelerConfirmRouteVoteWinner: (anyApi as any).routeVotes.travelerConfirmRouteVoteWinner as FunctionReference<
      "mutation",
      "public",
      { token: string; routeVoteId: string; winningOptionId: string },
      string
    >,
    travelerHideRouteVoteComment: (anyApi as any).routeVotes.travelerHideRouteVoteComment as FunctionReference<
      "mutation",
      "public",
      { token: string; submissionId: string },
      null
    >,
    travelerUpdateChallengeStatus: (anyApi as any).routeVotes.travelerUpdateChallengeStatus as FunctionReference<
      "mutation",
      "public",
      { token: string; challengeId: string; newStatus: ChallengeStatus },
      null
    >,
    markRouteVoteSeen: (anyApi as any).routeVotes.markRouteVoteSeen as FunctionReference<
      "mutation",
      "public",
      { token: string; routeVoteId: string },
      null
    >,
    submitRouteVote: (anyApi as any).routeVotes.submitRouteVote as FunctionReference<
      "mutation",
      "public",
      {
        token: string;
        routeVoteId: string;
        selectedOptionIds: string[];
        comment?: string;
        commentVisibility?: CommentVisibility;
      },
      null
    >,
    travelerListRouteVotes: (anyApi as any).routeVotes.travelerListRouteVotes as FunctionReference<
      "query",
      "public",
      { token: string },
      RouteVoteListItem[]
    >,
    travelerGetRouteVoteDetail: (anyApi as any).routeVotes.travelerGetRouteVoteDetail as FunctionReference<
      "query",
      "public",
      { token: string; routeVoteId: string },
      RouteVoteDetail
    >,
    getActiveRouteVoteAlert: (anyApi as any).routeVotes.getActiveRouteVoteAlert as FunctionReference<
      "query",
      "public",
      { token: string },
      { hasUnseen: boolean }
    >,
    listVisibleRouteVotes: (anyApi as any).routeVotes.listVisibleRouteVotes as FunctionReference<
      "query",
      "public",
      { token: string },
      VisibleRouteVote[]
    >,
    getRouteVoteMapOverlay: (anyApi as any).routeVotes.getRouteVoteMapOverlay as FunctionReference<
      "query",
      "public",
      { token: string; routeVoteId: string },
      RouteVoteMapOverlay
    >,
  },
} as const;

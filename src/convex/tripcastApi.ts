import { anyApi } from "convex/server";
import type { FunctionReference } from "convex/server";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type Role = "traveler" | "support_crew";

export type CheckpointSource = "right_click" | "tap_add_mode" | "long_press" | "current_activity";

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
  locationLabel?: string;
  showInStory?: boolean;
  lat: number;
  lon: number;
  source: CheckpointSource;
  // Optional inline state snapshot (atomic with checkpoint save)
  moodValue?: TravelerMoodValue;
  energyLevel?: TravelerEnergyLevel;
  energyScore?: number;
  stomachLevel?: TravelerStomachLevel;
  stomachScore?: number;
  stressLevel?: TravelerStressLevel;
  stressScore?: number;
  schedulePressureLevel?: TravelerSchedulePressureLevel;
  statusNote?: string;
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

export type TravelerLocation = {
  lat: number;
  lon: number;
  accuracy?: number;
  isSharing: true;
} | null;

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
    anonymous: boolean;
  };
  visibleComments: Array<{
    submissionId: string;
    comment: string;
    commentVisibility: CommentVisibility;
    author: string;
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
// Current Activity types
// ---------------------------------------------------------------------------

export type CurrentActivity = {
  _id: string;
  _creationTime: number;
  status: "active" | "completed" | "dropped";
  title: string;
  emoji?: string;
  note?: string;
  locationLabel?: string;
  lat?: number;
  lon?: number;
  startedAt: number;
  completedAt?: number;
  droppedAt?: number;
  linkedChallengeId?: string;
  completedCheckpointId?: string;
  createdAt: number;
  updatedAt: number;
};

// ---------------------------------------------------------------------------
// Traveler State types
// ---------------------------------------------------------------------------

export type TravelerMoodValue =
  | "hopeful"
  | "good"
  | "surprised"
  | "okay"
  | "melancholy"
  | "anxious"
  | "rough"
  | "disappointed"
  | "why_did_i_bother";

export type TravelerEnergyLevel = "very_low" | "low" | "medium" | "high" | "very_high";

export type TravelerStomachLevel =
  | "starving"
  | "famished"
  | "hungry"
  | "satisfied"
  | "full"
  | "stuffed"
  | "overate";

export type TravelerStressLevel = "calm" | "mild" | "stressed" | "overwhelmed";

export type TravelerSchedulePressureLevel = "ahead" | "comfortable" | "tight" | "rushed" | "behind";

export type TravelerStateUpdateSource = "manual_state_update" | "checkpoint_update";

export type TravelerStateFields = {
  stateAt: number;
  moodValue?: TravelerMoodValue;
  moodScore?: number;
  energyLevel?: TravelerEnergyLevel;
  energyScore?: number;
  stomachLevel?: TravelerStomachLevel;
  stomachScore?: number;
  stressLevel?: TravelerStressLevel;
  stressScore?: number;
  schedulePressureLevel?: TravelerSchedulePressureLevel;
  schedulePressureScore?: number;
  statusNote?: string;
  statusEmoji?: string;
  biometricSteps?: number;
  biometricAverageHeartRate?: number;
  biometricRestingHeartRate?: number;
  biometricSleepHours?: number;
  biometricActiveMinutes?: number;
  biometricNote?: string;
  biometricSource?: "manual";
  biometricsUpdatedAt?: number;
};

export type TravelerState = TravelerStateFields & {
  updatedAt: number;
  associatedCheckpointId?: string;
};

export type TravelerStateVisibility = {
  showTravelerState: boolean;
  showMood: boolean;
  showEnergy: boolean;
  showStomach: boolean;
  showStress: boolean;
  showSchedulePressure: boolean;
  showStatusNote: boolean;
  showBiometrics: boolean;
  updatedAt: number | null;
};

export type TravelerStateHistoryEntry = TravelerStateFields & {
  _id: string;
  changedAt: number;
  source: TravelerStateUpdateSource;
  associatedCheckpointId?: string;
};

export type TravelerStateForCrew =
  | { visible: false; updatedAt: null }
  | ({ visible: true } & Partial<TravelerStateFields> & { updatedAt: number | null });

export type UpdateTravelerStateArgs = {
  token: string;
  stateAt?: number;
  source?: TravelerStateUpdateSource;
  associatedCheckpointId?: string;
  moodValue?: TravelerMoodValue;
  moodScore?: number;
  energyLevel?: TravelerEnergyLevel;
  energyScore?: number;
  stomachLevel?: TravelerStomachLevel;
  stomachScore?: number;
  stressLevel?: TravelerStressLevel;
  stressScore?: number;
  schedulePressureLevel?: TravelerSchedulePressureLevel;
  schedulePressureScore?: number;
  statusNote?: string;
  statusEmoji?: string;
  biometricSteps?: number;
  biometricAverageHeartRate?: number;
  biometricRestingHeartRate?: number;
  biometricSleepHours?: number;
  biometricActiveMinutes?: number;
  biometricNote?: string;
  biometricSource?: "manual";
};

// ---------------------------------------------------------------------------
// History types
// ---------------------------------------------------------------------------

export type HistoryEventType =
  | "check_in"
  | "challenge_planned"
  | "challenge_in_progress"
  | "challenge_completed"
  | "challenge_dropped"
  | "route_vote_opened"
  | "route_vote_closed"
  | "route_vote_resolved"
  | "emergency_reset";

export type HistoryStoryLevel = "story" | "activity";

export type HistoryEvent = {
  _id: string;
  _creationTime: number;
  type: HistoryEventType;
  storyLevel: HistoryStoryLevel;
  occurredAt: number;
  createdAt: number;
  title?: string;
  body?: string;
  locationLabel?: string;
  lat?: number;
  lon?: number;
  checkpointId?: string;
  routeVoteId?: string;
  challengeId?: string;
  // State snapshot (check_in events only)
  moodValue?: TravelerMoodValue;
  energyLevel?: TravelerEnergyLevel;
  stomachLevel?: TravelerStomachLevel;
  stressLevel?: TravelerStressLevel;
  schedulePressureLevel?: TravelerSchedulePressureLevel;
  statusNote?: string;
};

// ---------------------------------------------------------------------------
// Follower / account types
// ---------------------------------------------------------------------------

export type MembershipStatus = "active" | "revoked";

export type FollowerSession = {
  role: Role;
  displayName: string;
  username: string;
  membershipStatus: MembershipStatus;
};

export type FollowerInfo = {
  userId: string;
  username: string;
  displayName: string;
  membershipStatus: MembershipStatus;
  isBanned: boolean;
  createdAt: number;
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
  privacy: {
    deleteAllCheckpoints: (anyApi as any).privacy.deleteAllCheckpoints as FunctionReference<
      "mutation",
      "public",
      { token: string },
      null
    >,
    clearTravelerLocation: (anyApi as any).privacy.clearTravelerLocation as FunctionReference<
      "mutation",
      "public",
      { token: string },
      null
    >,
    deleteAllTripData: (anyApi as any).privacy.deleteAllTripData as FunctionReference<
      "mutation",
      "public",
      { token: string },
      null
    >,
    emergencyReset: (anyApi as any).privacy.emergencyReset as FunctionReference<
      "mutation",
      "public",
      { token: string; includeAuthSessions: boolean },
      null
    >,
    logEveryoneOff: (anyApi as any).privacy.logEveryoneOff as FunctionReference<
      "mutation",
      "public",
      { token: string },
      null
    >,
    deleteTravelerState: (anyApi as any).privacy.deleteTravelerState as FunctionReference<
      "mutation",
      "public",
      { token: string },
      null
    >,
    deleteCurrentActivity: (anyApi as any).privacy.deleteCurrentActivity as FunctionReference<
      "mutation",
      "public",
      { token: string },
      null
    >,
  },
  travelerLocations: {
    updateTravelerLocation: (anyApi as any).routeVotes.updateTravelerLocation as FunctionReference<
      "mutation",
      "public",
      { token: string; lat: number; lon: number; accuracy?: number },
      null
    >,
    stopTravelerLocationSharing: (anyApi as any).routeVotes.stopTravelerLocationSharing as FunctionReference<
      "mutation",
      "public",
      { token: string },
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
        anonymous?: boolean;
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
      RouteVoteDetail | null
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
    travelerListPlannedChallenges: (anyApi as any).routeVotes.travelerListPlannedChallenges as FunctionReference<
      "query",
      "public",
      { token: string },
      Challenge[]
    >,
  },
  currentActivity: {
    travelerSetCurrentActivity: (anyApi as any).currentActivity.travelerSetCurrentActivity as FunctionReference<"mutation", "public", { token: string; title: string; emoji?: string; note?: string; locationLabel?: string; lat?: number; lon?: number; linkedChallengeId?: string }, string>,
    travelerDropCurrentActivity: (anyApi as any).currentActivity.travelerDropCurrentActivity as FunctionReference<"mutation", "public", { token: string; activityId: string }, null>,
    travelerCompleteCurrentActivity: (anyApi as any).currentActivity.travelerCompleteCurrentActivity as FunctionReference<"mutation", "public", { token: string; activityId: string; checkpointId: string }, null>,
    travelerGetCurrentActivity: (anyApi as any).currentActivity.travelerGetCurrentActivity as FunctionReference<"query", "public", { token: string }, CurrentActivity | null>,
    supportCrewGetCurrentActivity: (anyApi as any).currentActivity.supportCrewGetCurrentActivity as FunctionReference<"query", "public", { token: string }, CurrentActivity | null>,
    travelerListRecentActivities: (anyApi as any).currentActivity.travelerListRecentActivities as FunctionReference<"query", "public", { token: string }, CurrentActivity[]>,
  },
  travelerState: {
    travelerGetState: (anyApi as any).travelerState.travelerGetState as FunctionReference<
      "query",
      "public",
      { token: string },
      { state: TravelerState | null; visibility: TravelerStateVisibility }
    >,
    supportCrewGetTravelerState: (anyApi as any).travelerState.supportCrewGetTravelerState as FunctionReference<
      "query",
      "public",
      { token: string },
      TravelerStateForCrew
    >,
    travelerListStateHistory: (anyApi as any).travelerState.travelerListStateHistory as FunctionReference<
      "query",
      "public",
      { token: string },
      TravelerStateHistoryEntry[]
    >,
    travelerUpdateState: (anyApi as any).travelerState.travelerUpdateState as FunctionReference<
      "mutation",
      "public",
      UpdateTravelerStateArgs,
      null
    >,
    travelerUpdateStateVisibility: (anyApi as any).travelerState.travelerUpdateStateVisibility as FunctionReference<
      "mutation",
      "public",
      {
        token: string;
        showTravelerState?: boolean;
        showMood?: boolean;
        showEnergy?: boolean;
        showStomach?: boolean;
        showStress?: boolean;
        showSchedulePressure?: boolean;
        showStatusNote?: boolean;
        showBiometrics?: boolean;
      },
      null
    >,
  },
  historyEvents: {
    listHistoryEvents: (anyApi as any).historyEvents.listHistoryEvents as FunctionReference<
      "query",
      "public",
      { token: string },
      HistoryEvent[]
    >,
  },
  followers: {
    followerSignIn: (anyApi as any).followers.followerSignIn as FunctionReference<
      "mutation",
      "public",
      { username: string; password: string; rememberMe: boolean },
      { token: string }
    >,
    followerSignOut: (anyApi as any).followers.followerSignOut as FunctionReference<
      "mutation",
      "public",
      { token: string },
      null
    >,
    followerCurrentSession: (anyApi as any).followers.followerCurrentSession as FunctionReference<
      "query",
      "public",
      { token: string },
      FollowerSession | null
    >,
    redeemInvite: (anyApi as any).followers.redeemInvite as FunctionReference<
      "mutation",
      "public",
      {
        inviteToken: string;
        username: string;
        password: string;
        termsVersion: string;
        privacyVersion: string;
      },
      { token: string; username: string }
    >,
  },
  followerAdmin: {
    createInvite: (anyApi as any).followerAdmin.createInvite as FunctionReference<
      "mutation",
      "public",
      { token: string },
      { inviteToken: string }
    >,
    listFollowers: (anyApi as any).followerAdmin.listFollowers as FunctionReference<
      "query",
      "public",
      { token: string },
      FollowerInfo[]
    >,
    revokeAccess: (anyApi as any).followerAdmin.revokeAccess as FunctionReference<
      "mutation",
      "public",
      { token: string; userId: string },
      null
    >,
    unrevokeAccess: (anyApi as any).followerAdmin.unrevokeAccess as FunctionReference<
      "mutation",
      "public",
      { token: string; userId: string },
      null
    >,
    banUser: (anyApi as any).followerAdmin.banUser as FunctionReference<
      "mutation",
      "public",
      { token: string; userId: string },
      null
    >,
    unbanUser: (anyApi as any).followerAdmin.unbanUser as FunctionReference<
      "mutation",
      "public",
      { token: string; userId: string },
      null
    >,
    issuePasswordReset: (anyApi as any).followerAdmin.issuePasswordReset as FunctionReference<
      "mutation",
      "public",
      { token: string; userId: string },
      { resetToken: string }
    >,
    deleteFollowerAccount: (anyApi as any).followerAdmin.deleteFollowerAccount as FunctionReference<
      "mutation",
      "public",
      { token: string; userId: string },
      null
    >,
  },
  passwordReset: {
    consumePasswordReset: (anyApi as any).passwordReset.consumePasswordReset as FunctionReference<
      "mutation",
      "public",
      { resetToken: string; newPassword: string },
      null
    >,
  },
} as const;

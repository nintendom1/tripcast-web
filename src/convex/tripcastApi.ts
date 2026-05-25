import { anyApi } from "convex/server";
import type { FunctionReference } from "convex/server";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type Role = "traveler" | "follower";

export type CheckpointSource = "right_click" | "tap_add_mode" | "long_press" | "current_activity" | "inline_form";

export type Checkpoint = {
  _id: string;
  _creationTime: number;
  title: string;
  note?: string;
  locationLabel?: string;
  showInStory?: boolean;
  lat?: number;
  lon?: number;
  imageId?: string;
  source: CheckpointSource;
  /** Optional link to the mission a Story narrates (Complete-as-story flow). */
  missionId?: string;
  createdAt: number;
  updatedAt: number;
};

export type AddCheckpointArgs = {
  token: string;
  title?: string;
  note?: string;
  locationLabel?: string;
  showInStory?: boolean;
  lat?: number;
  lon?: number;
  imageId?: string;
  source: CheckpointSource;
  // Optional link back to the mission a Story narrates. Persisted on
  // the checkpoint and threaded into the emitted story event so
  // the Story tab can fold the paired mission_completed row.
  missionId?: string;
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
  // Optional inline Travel Funds transaction (atomic with checkpoint save).
  // Linked IDs are filled server-side: checkpointId from the new checkpoint,
  // and missionId/activityId from the active current activity when available.
  transaction?: TransactionInlineInput;
};

export type UpdateCheckpointArgs = {
  token: string;
  checkpointId: string;
  title?: string;
  note?: string;
  locationLabel?: string;
  showInStory?: boolean;
  lat?: number;
  lon?: number;
  imageId?: string;
  clearImage?: boolean;
};

export type DeleteCheckpointArgs = {
  token: string;
  checkpointId: string;
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

export type MissionStatus =
  | "proposed"
  | "visible"
  | "planned"
  | "in_progress"
  | "completed"
  | "dropped";

export type MissionSource = "route_vote" | "follower" | "traveler";

export type MissionModerationMode = "manual_review" | "auto_publish";

export type MissionRateLimitPreset = "off" | "per_second" | "per_minute" | "per_hour" | "per_day";

export type TravelerLocation = {
  lat: number;
  lon: number;
  accuracy?: number;
  isSharing: true;
} | null;

export type LiveTrailSample = {
  _id: string;
  lat: number;
  lon: number;
  accuracy?: number;
  sampledAt: number;
};

export type FollowerLiveTrailSample = {
  _id: string;
  lat: number;
  lon: number;
  sampledAt: number;
};

export type LiveTrailStatus = {
  enabled: boolean;
  visibleToFollowers: boolean;
  sampleCount: number;
  samples: LiveTrailSample[];
};

export type FollowerLiveTrail = {
  visible: boolean;
  samples: FollowerLiveTrailSample[];
};

export type LiveTrailPreviewSample = {
  _id: string;
  lat: number;
  lon: number;
  sampledAt: number;
};

export type LiveTrailDeletePreview = {
  startMs: number;
  endExclusiveMs: number;
  timeZone: string;
  count: number;
  samples: LiveTrailPreviewSample[];
};

export type LinkedMissionAction = "planned" | "visible" | "leave";

export type RouteVoteOptionInput = {
  title: string;
  description?: string;
  locationLabel?: string;
  lat?: number;
  lon?: number;
  estimatedCostUsd?: number;
  estimatedDurationMinutes?: number;
  estimatedEnergyImpact?: EnergyImpact;
  /** Optional link to an existing non-completed Mission this option mirrors. */
  linkedMissionId?: string;
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
  resultingMissionId?: string;
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
  mission?: Mission;
};

export type VisibleRouteVote = {
  _id: string;
  title: string;
  description?: string;
  effectiveStatus: RouteVoteStatus;
  resultsVisibility: ResultsVisibility;
  expiresAt: number;
  confirmedWinningOptionId?: string;
  resultingMissionId?: string;
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

export type Mission = {
  _id: string;
  title: string;
  description?: string;
  status: MissionStatus;
  source: MissionSource;
  sourceRouteVoteId?: string;
  sourceRouteVoteOptionId?: string;
  /** Reciprocal link set when a pre-existing Mission won a route vote.
   *  Does not change the Mission source/sourceRouteVoteId. */
  linkedRouteVoteId?: string;
  linkedRouteVoteOptionId?: string;
  proposedBySessionId?: string;
  proposedByUserId?: string;
  locationLabel?: string;
  lat?: number;
  lon?: number;
  estimatedCostUsd?: number;
  estimatedDurationMinutes?: number;
  estimatedEnergyImpact?: EnergyImpact;
  travelerResponseNote?: string;
  travelerResponsePreset?: string;
  silentDrop?: boolean;
  mapHidden?: boolean;
  acceptedAt?: number;
  startedAt?: number;
  completedAt?: number;
  droppedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type MissionSettings = {
  moderationMode: MissionModerationMode;
  rateLimitPreset: MissionRateLimitPreset;
};

export type MissionContentArgs = {
  title: string;
  description?: string;
  locationLabel?: string;
  lat?: number;
  lon?: number;
  estimatedCostUsd?: number;
  estimatedDurationMinutes?: number;
  estimatedEnergyImpact?: EnergyImpact;
};

// ---------------------------------------------------------------------------
// Achievements / scoring types
// ---------------------------------------------------------------------------

export type AchievementEventType =
  | "daily_visit"
  | "mission_proposed_weekly"
  | "mission_visible"
  | "mission_completed"
  | "mission_featured_in_story"
  | "badge_awarded";

export type AchievementSourceType = "visit" | "mission" | "story";

export type BadgeType =
  | "life_changing"
  | "tasty"
  | "entertained"
  | "refreshing"
  | "popular";

export type AchievementEvent = {
  _id: string;
  _creationTime: number;
  recipientUserId?: string;
  recipientSessionId?: string;
  isDev: boolean;
  eventType: AchievementEventType;
  badgeType?: BadgeType;
  points: number;
  uniqueKey: string;
  sourceType: AchievementSourceType;
  sourceMissionId?: string;
  sourceCheckpointId?: string;
  title: string;
  message: string;
  detail?: string;
  createdAt: number;
  toastedAt?: number;
  seenAt?: number;
};

export type ScoreSummary = {
  total: number;
  count: number;
  isDev: boolean;
  unseenCount: number;
  recent: AchievementEvent[];
};

export type ScoringSettings = {
  developerScoringEnabled: boolean;
};

export type AttributionSourceType = "mission" | "story";

export type AttributionRole =
  | "creator"
  | "proposer"
  | "contributor"
  | "credited"
  | "traveler_added";

export type AttributionList = {
  publicCopy: string | null;
  attributions: Array<{
    _id: string;
    role: AttributionRole;
    userId: string | null;
    displayName: string | null;
    username: string | null;
    showAttribution: boolean | null;
    isDev: boolean;
    // Badges this attributor earned for this source (point-free).
    badges: Array<{ badgeType: BadgeType; emoji: string; name: string }>;
  }>;
};

export type AttributionSettings = {
  showAttribution: boolean;
};

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export type BadgeSourceType = "mission" | "story";

// Points are intentionally absent — they never surface on Badge chips/detail,
// only in the achievement History ledger (AchievementEvent.points).
export type BadgeDefinition = {
  badgeType: BadgeType;
  name: string;
  emoji: string;
  description: string;
};

export type BadgeBoardAward = {
  sourceType: BadgeSourceType;
  sourceLabel: string;
  awardedAt: number;
  note?: string;
};

export type BadgeBoardEntry = BadgeDefinition & {
  earned: boolean;
  count: number;
  awards: BadgeBoardAward[];
};

export type BadgeBoard = {
  isDev: boolean;
  badges: BadgeBoardEntry[];
};

export type BadgeAwardRecipient = {
  idTag: string;
  userId: string | null;
  devSessionId: string | null;
  displayName: string;
  isDev: boolean;
  hiddenAttribution: boolean;
};

export type BadgeAwardContext = {
  sourceLabel: string;
  recipients: BadgeAwardRecipient[];
  badges: BadgeDefinition[];
  awarded: Array<{ idTag: string; badgeType: BadgeType }>;
};

export type BadgeAwardResult = {
  awardedCount: number;
  alreadyAwardedCount: number;
  skippedNotAttributedCount: number;
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
  linkedMissionId?: string;
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
  showTravelerClock: boolean;
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

export type TravelerStateForFollower =
  | { visible: false; updatedAt: null }
  | ({ visible: true } & Partial<TravelerStateFields> & { updatedAt: number | null });

// ---------------------------------------------------------------------------
// Auto State types
// ---------------------------------------------------------------------------

export type AutoStateSettings = {
  autoBedtimeMinutes: number;
  autoWakeTimeMinutes: number;
  autoEnergyMin: number;
  autoEnergyMax: number;
  autoStomachMin: number;
  autoStomachMax: number;
  autoEnergySleepDeltaPerTick: number;
  autoEnergyAwakeDeltaPerTick: number;
  autoStomachAwakeDeltaPerTick: number;
  autoStomachNightAboveHungryEveryTicks: number;
  autoStomachNightAtOrBelowHungryEveryTicks: number;
};

export type AutoState = AutoStateSettings & {
  autoStateEnabled: boolean;
  autoEnabledAt?: number;
  autoTimeZone: string;
  autoBaseEnergyScore?: number;
  autoBaseStomachScore?: number;
  updatedAt: number | null;
  updatedBySessionId: string | null;
};

export type AutoStateForFollower =
  | { visible: false }
  | { visible: true; autoStateEnabled: false; autoTimeZone?: string }
  | (AutoStateSettings & {
      visible: true;
      autoStateEnabled: true;
      autoEnabledAt?: number;
      autoTimeZone?: string;
      autoBaseEnergyScore?: number;
      autoBaseStomachScore?: number;
      updatedAt: number;
    });

export type TravelerPreferences = {
  travelerTimeZone?: string;
  travelerTimeZoneSource?: "device" | "manual";
  travelerTimeZoneUpdatedAt?: number;
  allowFollowersTripPath: boolean;
  updatedAt: number | null;
};

export type TravelerPreferencesForFollower =
  | { visible: false }
  | { visible: true; travelerTimeZone?: string; allowFollowersTripPath: boolean };

export type Message = {
  _id: string;
  _creationTime: number;
  text: string;
  authorName: string;
  authorId?: string;
  role: "traveler" | "follower" | "system";
  targetUserId?: string;
  triggeredByUserId?: string;
  triggeredBySessionId?: string;
  associatedId?: any;
  associatedType?: "mission" | "checkpoint" | "transaction" | "route_vote";
};

export type Doc<T extends string> = T extends "messages" ? Message : any;

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
// Journal types
// ---------------------------------------------------------------------------

export type JournalEventType =
  | "story"
  | "mission_proposed"
  | "mission_visible"
  | "mission_planned"
  | "mission_in_progress"
  | "mission_completed"
  | "mission_dropped"
  | "route_vote_opened"
  | "route_vote_closed"
  | "route_vote_resolved"
  | "emergency_reset";

export type JournalNarrativeLevel = "narrative" | "activity";

export type JournalEvent = {
  _id: string;
  _creationTime: number;
  type: JournalEventType;
  narrativeLevel: JournalNarrativeLevel;
  occurredAt: number;
  createdAt: number;
  title?: string;
  body?: string;
  locationLabel?: string;
  lat?: number;
  lon?: number;
  imageId?: string;
  checkpointId?: string;
  routeVoteId?: string;
  missionId?: string;
  // State snapshot (story events only)
  moodValue?: TravelerMoodValue;
  energyLevel?: TravelerEnergyLevel;
  stomachLevel?: TravelerStomachLevel;
  stressLevel?: TravelerStressLevel;
  schedulePressureLevel?: TravelerSchedulePressureLevel;
  statusNote?: string;
};

// ---------------------------------------------------------------------------
// Travel Funds types
// ---------------------------------------------------------------------------

export type TransactionCategory =
  | "food"
  | "transport"
  | "lodging"
  | "event"
  | "shopping"
  | "souvenirs"
  | "logistics"
  | "research"
  | "other";

export type TransactionVisibility = "public" | "summary_only" | "private";

export type TravelFundsConfigForTraveler =
  | { enabled: false }
  | {
      enabled: true;
      startingBudgetUsd: number;
      budgetLabel?: string;
      remainingUsd: number;
      spentUsd: number;
    };

export type TravelFundsSummaryForFollower =
  | { enabled: false }
  | {
      enabled: true;
      startingBudgetUsd: number;
      budgetLabel?: string;
      remainingUsd: number;
      spentUsd: number;
    };

export type Transaction = {
  _id: string;
  _creationTime: number;
  title: string;
  note?: string;
  category: TransactionCategory;
  currencyCode: string;
  localAmount: number;
  localCurrencyPerUsd: number;
  usdAmount: number;
  countsTowardMeter: boolean;
  visibility: TransactionVisibility;
  linkedActivityId?: string;
  linkedMissionId?: string;
  linkedCheckpointId?: string;
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
};

export type TransactionForFollowerSummary = {
  _id: string;
  visibility: "summary_only";
  usdAmount: number;
  occurredAt: number;
};

export type TransactionForFollowerPublic = {
  _id: string;
  _creationTime: number;
  visibility: "public";
  title: string;
  note?: string;
  category: TransactionCategory;
  currencyCode: string;
  localAmount: number;
  localCurrencyPerUsd: number;
  usdAmount: number;
  countsTowardMeter: boolean;
  linkedActivityId?: string;
  linkedMissionId?: string;
  linkedCheckpointId?: string;
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
};

export type TransactionForFollower = TransactionForFollowerSummary | TransactionForFollowerPublic;

export type AddTransactionArgs = {
  token: string;
  title: string;
  note?: string;
  category: TransactionCategory;
  currencyCode: string;
  localAmount: number;
  localCurrencyPerUsd: number;
  countsTowardMeter: boolean;
  visibility: TransactionVisibility;
  linkedActivityId?: string;
  linkedMissionId?: string;
  linkedCheckpointId?: string;
  occurredAt?: number;
};

export type UpdateTransactionArgs = {
  token: string;
  transactionId: string;
  title?: string;
  note?: string;
  category?: TransactionCategory;
  currencyCode?: string;
  localAmount?: number;
  localCurrencyPerUsd?: number;
  countsTowardMeter?: boolean;
  visibility?: TransactionVisibility;
  linkedActivityId?: string;
  linkedMissionId?: string;
  linkedCheckpointId?: string;
  occurredAt?: number;
};

export type UpdateTravelFundsConfigArgs = {
  token: string;
  featureEnabled?: boolean;
  startingBudgetUsd?: number;
  budgetLabel?: string;
};

// Inline transaction payload attached to addCheckpoint / travelerCompleteMission.
// Linked IDs are filled in server-side based on the calling mutation's context.
export type TransactionInlineInput = {
  title: string;
  note?: string;
  category: TransactionCategory;
  currencyCode: string;
  localAmount: number;
  localCurrencyPerUsd: number;
  countsTowardMeter: boolean;
  visibility: TransactionVisibility;
  occurredAt?: number;
};

export type LinkedCostMap = {
  byMissionId: Record<string, number>;
  byCheckpointId: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Bulk Import types
// ---------------------------------------------------------------------------

export type BulkImportKind = "checkin" | "story" | "transaction" | "mission" | "route_vote";
export type BulkImportTimestamp = number | string;

export type BulkImportRouteVoteOption = {
  ref?: string;
  title: string;
  description?: string;
  locationLabel?: string;
  place?: string;
  lat?: number;
  lon?: number;
  estimatedCostUsd?: number;
  estimatedDurationMinutes?: number;
  estimatedEnergyImpact?: EnergyImpact;
};

export type BulkImportEntry =
  | {
      kind: "checkin" | "story";
      ref?: string;
      timeZone?: string;
      title?: string;
      note?: string;
      body?: string;
      locationLabel?: string;
      place?: string;
      showInStory?: boolean;
      lat: number;
      lon: number;
      source?: CheckpointSource;
      occurredAt?: BulkImportTimestamp;
      when?: BulkImportTimestamp;
    }
  | {
      kind: "transaction";
      ref?: string;
      timeZone?: string;
      title: string;
      note?: string;
      category?: TransactionCategory;
      currencyCode?: string;
      localAmount?: number;
      amount?: number;
      localCurrencyPerUsd?: number;
      countsTowardMeter?: boolean;
      visibility?: TransactionVisibility;
      linkedToRef?: string;
      occurredAt?: BulkImportTimestamp;
      when?: BulkImportTimestamp;
    }
  | {
      kind: "mission";
      ref?: string;
      timeZone?: string;
      title: string;
      description?: string;
      note?: string;
      status?: MissionStatus;
      locationLabel?: string;
      loc?: string;
      lat?: number;
      lon?: number;
      estimatedCostUsd?: number;
      estimatedDurationMinutes?: number;
      estimatedEnergyImpact?: EnergyImpact;
      sourceRouteVoteRef?: string;
      sourceRouteVoteOptionRef?: string;
      occurredAt?: BulkImportTimestamp;
      when?: BulkImportTimestamp;
    }
  | {
      kind: "route_vote" | "vote";
      ref?: string;
      timeZone?: string;
      title: string;
      description?: string;
      status?: RouteVoteStatus;
      expiresAt?: BulkImportTimestamp;
      resultsVisibility?: ResultsVisibility;
      options: BulkImportRouteVoteOption[];
      confirmedWinningOptionRef?: string;
      resultingMissionRef?: string;
      occurredAt?: BulkImportTimestamp;
      when?: BulkImportTimestamp;
    };

export type BulkImportPayload =
  | BulkImportEntry[]
  | {
      timeZone?: string;
      entries: BulkImportEntry[];
    };

export type BulkImportCounts = {
  checkins: number;
  transactions: number;
  missions: number;
  routeVotes: number;
};

export type BulkImportPreviewError = {
  index?: number;
  ref?: string;
  message: string;
};

export type BulkImportPreviewRow = {
  index: number;
  kind: BulkImportKind;
  ref?: string;
  title: string;
  detail?: string;
  links: string[];
};

export type BulkImportPreview = {
  valid: boolean;
  maxEntries: number;
  counts: BulkImportCounts;
  rows: BulkImportPreviewRow[];
  errors: BulkImportPreviewError[];
};

export type BulkImportResult = {
  imported: number;
  counts: BulkImportCounts;
  idsByRef: Record<string, string>;
};

// ---------------------------------------------------------------------------
// End Trip / credits
// ---------------------------------------------------------------------------

export type TripCreditsEntry = { name: string; points: number; badges: number };

export type TripCredits = {
  ended: boolean;
  endedAt?: number;
  thankYouNote?: string;
  travelerName: string;
  followers: string[];
  leaderboard: TripCreditsEntry[];
  totals: { points: number; badges: number; followers: number };
};

// ---------------------------------------------------------------------------
// Follower / account types
// ---------------------------------------------------------------------------

export type MembershipStatus = "active" | "revoked";

export type FollowerSession = {
  role: Role;
  userId: string;
  sessionId: string;
  displayName: string;
  username: string;
  showAttribution: boolean;
  membershipStatus: MembershipStatus;
};

export type IntroSeenPreference = {
  role: Role;
  introSeen: boolean;
  introSeenAt?: number;
} | null;

export type FollowerInfo = {
  userId: string;
  username: string;
  displayName: string;
  showAttribution: boolean;
  membershipStatus: MembershipStatus;
  isBanned: boolean;
  createdAt: number;
};

// ---------------------------------------------------------------------------
// API namespace
// ---------------------------------------------------------------------------

export const tripcastApi = {
  bulkImport: {
    previewBulkImport: (anyApi as any).bulkImport.previewBulkImport as FunctionReference<
      "query",
      "public",
      { token: string; entries: BulkImportPayload },
      BulkImportPreview
    >,
    travelerBulkImport: (anyApi as any).bulkImport.travelerBulkImport as FunctionReference<
      "mutation",
      "public",
      { token: string; entries: BulkImportPayload },
      BulkImportResult
    >,
    travelerExportTripData: (anyApi as any).bulkImport.travelerExportTripData as FunctionReference<
      "query",
      "public",
      { token: string; startMs?: number; endMs?: number },
      BulkImportPayload
    >,
  },
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
      { role: Role; userId?: string; sessionId: string } | null
    >,
    signOut: (anyApi as any).auth.signOut as FunctionReference<
      "mutation",
      "public",
      { token: string },
      null
    >,
  },
  checkpoints: {
    generateStoryImageUploadUrl: (anyApi as any).checkpoints.generateStoryImageUploadUrl as FunctionReference<
      "mutation",
      "public",
      { token: string },
      string
    >,
    listCheckpoints: (anyApi as any).checkpoints.listCheckpoints as FunctionReference<
      "query",
      "public",
      { token: string },
      Checkpoint[]
    >,
    getStoryImageUrl: (anyApi as any).checkpoints.getStoryImageUrl as FunctionReference<
      "query",
      "public",
      { token: string; imageId: string },
      string | null
    >,
    addCheckpoint: (anyApi as any).checkpoints.addCheckpoint as FunctionReference<
      "mutation",
      "public",
      AddCheckpointArgs,
      string
    >,
    updateCheckpoint: (anyApi as any).checkpoints.updateCheckpoint as FunctionReference<
      "mutation",
      "public",
      UpdateCheckpointArgs,
      null
    >,
    deleteCheckpoint: (anyApi as any).checkpoints.deleteCheckpoint as FunctionReference<
      "mutation",
      "public",
      DeleteCheckpointArgs,
      null
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
  liveTrail: {
    travelerSetLiveTrailEnabled: (anyApi as any).liveTrail.travelerSetLiveTrailEnabled as FunctionReference<
      "mutation",
      "public",
      { token: string; enabled: boolean },
      null
    >,
    travelerSetLiveTrailVisibility: (anyApi as any).liveTrail.travelerSetLiveTrailVisibility as FunctionReference<
      "mutation",
      "public",
      { token: string; visibleToFollowers: boolean },
      null
    >,
    travelerRecordLiveTrailSample: (anyApi as any).liveTrail.travelerRecordLiveTrailSample as FunctionReference<
      "mutation",
      "public",
      { token: string; lat: number; lon: number; accuracy?: number; sampledAt?: number },
      null
    >,
    travelerDeleteRecentLiveTrail: (anyApi as any).liveTrail.travelerDeleteRecentLiveTrail as FunctionReference<
      "mutation",
      "public",
      { token: string; recentMs?: number },
      { deleted: number }
    >,
    travelerPreviewLiveTrailDeleteRange: (anyApi as any).liveTrail.travelerPreviewLiveTrailDeleteRange as FunctionReference<
      "query",
      "public",
      { token: string; startDate: string; endDate: string; timeZone: string },
      LiveTrailDeletePreview
    >,
    travelerDeleteLiveTrailRange: (anyApi as any).liveTrail.travelerDeleteLiveTrailRange as FunctionReference<
      "mutation",
      "public",
      { token: string; startDate: string; endDate: string; timeZone: string },
      { deleted: number }
    >,
    travelerGetLiveTrailStatus: (anyApi as any).liveTrail.travelerGetLiveTrailStatus as FunctionReference<
      "query",
      "public",
      { token: string },
      LiveTrailStatus
    >,
    followerListLiveTrailSamples: (anyApi as any).liveTrail.followerListLiveTrailSamples as FunctionReference<
      "query",
      "public",
      { token: string },
      FollowerLiveTrail
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
      { token: string; routeVoteId: string; winningOptionId: string; linkedMissionAction?: LinkedMissionAction },
      string
    >,
    travelerHideRouteVoteComment: (anyApi as any).routeVotes.travelerHideRouteVoteComment as FunctionReference<
      "mutation",
      "public",
      { token: string; submissionId: string },
      null
    >,
    travelerUpdateMissionStatus: (anyApi as any).routeVotes.travelerUpdateMissionStatus as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string; newStatus: MissionStatus },
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
    travelerListPlannedMissions: (anyApi as any).routeVotes.travelerListPlannedMissions as FunctionReference<
      "query",
      "public",
      { token: string },
      Mission[]
    >,
  },
  missions: {
    followerProposeMission: (anyApi as any).missions.followerProposeMission as FunctionReference<
      "mutation",
      "public",
      { token: string; clientLocalDate?: string } & MissionContentArgs,
      { missionId: string; autoPublished: boolean }
    >,
    followerWithdrawMission: (anyApi as any).missions.followerWithdrawMission as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string },
      null
    >,
    travelerCreateMission: (anyApi as any).missions.travelerCreateMission as FunctionReference<
      "mutation",
      "public",
      { token: string; clientLocalDate?: string } & MissionContentArgs,
      string
    >,
    travelerEditMission: (anyApi as any).missions.travelerEditMission as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string } & MissionContentArgs,
      null
    >,
    travelerAcceptMission: (anyApi as any).missions.travelerAcceptMission as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string; responseNote?: string; responsePreset?: string },
      null
    >,
    travelerDropMission: (anyApi as any).missions.travelerDropMission as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string; responseNote?: string; responsePreset?: string; silent?: boolean },
      null
    >,
    travelerDeleteMission: (anyApi as any).missions.travelerDeleteMission as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string },
      null
    >,
    travelerStartMission: (anyApi as any).missions.travelerStartMission as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string },
      null
    >,
    travelerCompleteMission: (anyApi as any).missions.travelerCompleteMission as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string; transaction?: TransactionInlineInput },
      null
    >,
    travelerCompleteMissionAsStory: (anyApi as any).missions.travelerCompleteMissionAsStory as FunctionReference<
      "mutation",
      "public",
      {
        token: string;
        missionId: string;
        title?: string;
        note?: string;
        locationLabel?: string;
        lat: number;
        lon: number;
        source: CheckpointSource;
        imageId?: string;
        transaction?: TransactionInlineInput;
        awardBadgeType?: BadgeType;
      },
      string
    >,
    travelerToggleMissionMapPin: (anyApi as any).missions.travelerToggleMissionMapPin as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string; hidden: boolean },
      null
    >,
    travelerListMissions: (anyApi as any).missions.travelerListMissions as FunctionReference<
      "query",
      "public",
      { token: string; status?: MissionStatus },
      Mission[]
    >,
    followerListMissions: (anyApi as any).missions.followerListMissions as FunctionReference<
      "query",
      "public",
      { token: string },
      Mission[]
    >,
    followerListMyMissions: (anyApi as any).missions.followerListMyMissions as FunctionReference<
      "query",
      "public",
      { token: string },
      { mine: Mission[]; public: Mission[] }
    >,
    getMission: (anyApi as any).missions.getMission as FunctionReference<
      "query",
      "public",
      { token: string; missionId: string },
      Mission | null
    >,
    listMissionMapPins: (anyApi as any).missions.listMissionMapPins as FunctionReference<
      "query",
      "public",
      { token: string },
      Mission[]
    >,
  },
  missionSettings: {
    travelerGetMissionSettings: (anyApi as any).missionSettings.travelerGetMissionSettings as FunctionReference<
      "query",
      "public",
      { token: string },
      MissionSettings
    >,
    followerGetMissionSettings: (anyApi as any).missionSettings.followerGetMissionSettings as FunctionReference<
      "query",
      "public",
      { token: string },
      { moderationMode: MissionModerationMode }
    >,
    travelerUpdateMissionSettings: (anyApi as any).missionSettings.travelerUpdateMissionSettings as FunctionReference<
      "mutation",
      "public",
      { token: string; moderationMode?: MissionModerationMode; rateLimitPreset?: MissionRateLimitPreset },
      null
    >,
  },
  currentActivity: {
    travelerSetCurrentActivity: (anyApi as any).currentActivity.travelerSetCurrentActivity as FunctionReference<"mutation", "public", { token: string; title: string; emoji?: string; note?: string; locationLabel?: string; lat?: number; lon?: number; linkedMissionId?: string }, string>,
    travelerDropCurrentActivity: (anyApi as any).currentActivity.travelerDropCurrentActivity as FunctionReference<"mutation", "public", { token: string; activityId: string }, null>,
    travelerCompleteCurrentActivity: (anyApi as any).currentActivity.travelerCompleteCurrentActivity as FunctionReference<"mutation", "public", { token: string; activityId: string; checkpointId: string }, null>,
    travelerGetCurrentActivity: (anyApi as any).currentActivity.travelerGetCurrentActivity as FunctionReference<"query", "public", { token: string }, CurrentActivity | null>,
    followerGetCurrentActivity: (anyApi as any).currentActivity.followerGetCurrentActivity as FunctionReference<"query", "public", { token: string }, CurrentActivity | null>,
    travelerListRecentActivities: (anyApi as any).currentActivity.travelerListRecentActivities as FunctionReference<"query", "public", { token: string }, CurrentActivity[]>,
  },
  travelerState: {
    travelerGetState: (anyApi as any).travelerState.travelerGetState as FunctionReference<
      "query",
      "public",
      { token: string },
      { state: TravelerState | null; visibility: TravelerStateVisibility }
    >,
    followerGetTravelerState: (anyApi as any).travelerState.followerGetTravelerState as FunctionReference<
      "query",
      "public",
      { token: string },
      TravelerStateForFollower
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
        showTravelerClock?: boolean;
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
  travelerAutoState: {
    travelerGetAutoState: (anyApi as any).travelerAutoState.travelerGetAutoState as FunctionReference<
      "query",
      "public",
      { token: string },
      AutoState
    >,
    followerGetAutoState: (anyApi as any).travelerAutoState.followerGetAutoState as FunctionReference<
      "query",
      "public",
      { token: string },
      AutoStateForFollower
    >,
    travelerSetAutoStateEnabled: (anyApi as any).travelerAutoState.travelerSetAutoStateEnabled as FunctionReference<
      "mutation",
      "public",
      { token: string; enabled: boolean; timeZone: string },
      null
    >,
    travelerUpdateAutoStateSettings: (anyApi as any).travelerAutoState.travelerUpdateAutoStateSettings as FunctionReference<
      "mutation",
      "public",
      { token: string } & AutoStateSettings,
      null
    >,
    travelerRebaseAutoStateTimeZone: (anyApi as any).travelerAutoState.travelerRebaseAutoStateTimeZone as FunctionReference<
      "mutation",
      "public",
      {
        token: string;
        newTimeZone: string;
        rebasedEstimatedEnergy: number;
        rebasedEstimatedStomach: number;
      },
      null
    >,
  },
  travelerPreferences: {
    travelerGetPreferences: (anyApi as any).travelerPreferences.travelerGetPreferences as FunctionReference<
      "query",
      "public",
      { token: string },
      TravelerPreferences
    >,
    followerGetPreferences: (anyApi as any).travelerPreferences.followerGetPreferences as FunctionReference<
      "query",
      "public",
      { token: string },
      TravelerPreferencesForFollower
    >,
    travelerSetTimeZone: (anyApi as any).travelerPreferences.travelerSetTimeZone as FunctionReference<
      "mutation",
      "public",
      { token: string; timeZone: string; source?: "device" | "manual" },
      null
    >,
    travelerEnsureTimeZone: (anyApi as any).travelerPreferences.travelerEnsureTimeZone as FunctionReference<
      "mutation",
      "public",
      { token: string; timeZone: string; source?: "device" | "manual" },
      { updated: boolean }
    >,
    travelerUpdatePreferences: (anyApi as any).travelerPreferences.travelerUpdatePreferences as FunctionReference<
      "mutation",
      "public",
      { token: string; allowFollowersTripPath?: boolean },
      null
    >,
  },
  onboarding: {
    getIntroSeenPreference: (anyApi as any).onboarding.getIntroSeenPreference as FunctionReference<
      "query",
      "public",
      { token: string },
      IntroSeenPreference
    >,
    markIntroSeen: (anyApi as any).onboarding.markIntroSeen as FunctionReference<
      "mutation",
      "public",
      { token: string },
      null
    >,
  },
  journalEvents: {
    listJournalEvents: (anyApi as any).journalEvents.listJournalEvents as FunctionReference<
      "query",
      "public",
      { token: string },
      JournalEvent[]
    >,
  },
  endTrip: {
    travelerEndTrip: (anyApi as any).endTrip.travelerEndTrip as FunctionReference<
      "mutation",
      "public",
      { token: string; thankYouNote?: string },
      null
    >,
    travelerReopenTrip: (anyApi as any).endTrip.travelerReopenTrip as FunctionReference<
      "mutation",
      "public",
      { token: string },
      null
    >,
    getTripCredits: (anyApi as any).endTrip.getTripCredits as FunctionReference<
      "query",
      "public",
      { token: string },
      TripCredits
    >,
  },
  scoring: {
    getScoreSummary: (anyApi as any).scoring.getScoreSummary as FunctionReference<
      "query",
      "public",
      { token: string },
      ScoreSummary | null
    >,
    listAchievementHistory: (anyApi as any).scoring.listAchievementHistory as FunctionReference<
      "query",
      "public",
      { token: string },
      AchievementEvent[]
    >,
    listUnseenAchievements: (anyApi as any).scoring.listUnseenAchievements as FunctionReference<
      "query",
      "public",
      { token: string },
      AchievementEvent[]
    >,
    listUntoastedAchievements: (anyApi as any).scoring.listUntoastedAchievements as FunctionReference<
      "query",
      "public",
      { token: string },
      AchievementEvent[]
    >,
    recordDailyVisit: (anyApi as any).scoring.recordDailyVisit as FunctionReference<
      "mutation",
      "public",
      { token: string; localDateKey: string },
      null
    >,
    markAchievementsToasted: (anyApi as any).scoring.markAchievementsToasted as FunctionReference<
      "mutation",
      "public",
      { token: string; ids: string[] },
      null
    >,
    markAchievementsSeen: (anyApi as any).scoring.markAchievementsSeen as FunctionReference<
      "mutation",
      "public",
      { token: string },
      null
    >,
    travelerGetScoringSettings: (anyApi as any).scoring.travelerGetScoringSettings as FunctionReference<
      "query",
      "public",
      { token: string },
      ScoringSettings
    >,
    travelerSetDeveloperScoring: (anyApi as any).scoring.travelerSetDeveloperScoring as FunctionReference<
      "mutation",
      "public",
      { token: string; enabled: boolean },
      null
    >,
  },
  attributions: {
    listAttributionsForSource: (anyApi as any).attributions.listAttributionsForSource as FunctionReference<
      "query",
      "public",
      { token: string; sourceType: AttributionSourceType; sourceId: string },
      AttributionList
    >,
    getMyAttributionSettings: (anyApi as any).attributions.getMyAttributionSettings as FunctionReference<
      "query",
      "public",
      { token: string },
      AttributionSettings
    >,
    setShowAttribution: (anyApi as any).attributions.setShowAttribution as FunctionReference<
      "mutation",
      "public",
      { token: string; showAttribution: boolean },
      null
    >,
    travelerSetFollowerAttributions: (anyApi as any).attributions.travelerSetFollowerAttributions as FunctionReference<
      "mutation",
      "public",
      {
        token: string;
        sourceType: AttributionSourceType;
        sourceId: string;
        attributions: Array<{ userId: string; role?: AttributionRole }>;
      },
      null
    >,
  },
  badges: {
    listBadgeDefinitions: (anyApi as any).badges.listBadgeDefinitions as FunctionReference<
      "query",
      "public",
      { token: string },
      BadgeDefinition[]
    >,
    getMyBadges: (anyApi as any).badges.getMyBadges as FunctionReference<
      "query",
      "public",
      { token: string },
      BadgeBoard | null
    >,
    travelerGetBadgeAwardContext: (anyApi as any).badges.travelerGetBadgeAwardContext as FunctionReference<
      "query",
      "public",
      { token: string; sourceType: BadgeSourceType; sourceId: string },
      BadgeAwardContext
    >,
    travelerAwardBadges: (anyApi as any).badges.travelerAwardBadges as FunctionReference<
      "mutation",
      "public",
      {
        token: string;
        sourceType: BadgeSourceType;
        sourceId: string;
        badgeType: BadgeType;
        recipients: Array<{ userId?: string; devSessionId?: string }>;
        note?: string;
      },
      BadgeAwardResult
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
  travelFunds: {
    travelerGetConfig: (anyApi as any).travelFunds.travelerGetConfig as FunctionReference<
      "query",
      "public",
      { token: string },
      TravelFundsConfigForTraveler
    >,
    travelerUpdateConfig: (anyApi as any).travelFunds.travelerUpdateConfig as FunctionReference<
      "mutation",
      "public",
      UpdateTravelFundsConfigArgs,
      null
    >,
    travelerListTransactions: (anyApi as any).travelFunds.travelerListTransactions as FunctionReference<
      "query",
      "public",
      { token: string; limit?: number },
      Transaction[]
    >,
    travelerAddTransaction: (anyApi as any).travelFunds.travelerAddTransaction as FunctionReference<
      "mutation",
      "public",
      AddTransactionArgs,
      string
    >,
    travelerUpdateTransaction: (anyApi as any).travelFunds.travelerUpdateTransaction as FunctionReference<
      "mutation",
      "public",
      UpdateTransactionArgs,
      null
    >,
    travelerDeleteTransaction: (anyApi as any).travelFunds.travelerDeleteTransaction as FunctionReference<
      "mutation",
      "public",
      { token: string; transactionId: string },
      null
    >,
    followerGetFundsSummary: (anyApi as any).travelFunds.followerGetFundsSummary as FunctionReference<
      "query",
      "public",
      { token: string },
      TravelFundsSummaryForFollower
    >,
    followerListVisibleTransactions: (anyApi as any).travelFunds.followerListVisibleTransactions as FunctionReference<
      "query",
      "public",
      { token: string },
      TransactionForFollower[]
    >,
    getLinkedCostMap: (anyApi as any).travelFunds.getLinkedCostMap as FunctionReference<
      "query",
      "public",
      { token: string },
      LinkedCostMap
    >,
  },
  messages: {
    listMessages: (anyApi as any).messages.listMessages as FunctionReference<
      "query",
      "public",
      { token: string },
      Message[]
    >,
    sendMessage: (anyApi as any).messages.sendMessage as FunctionReference<
      "mutation",
      "public",
      { token: string; text: string },
      null
    >,
    deleteMessage: (anyApi as any).messages.deleteMessage as FunctionReference<
      "mutation",
      "public",
      { token: string; messageId: string },
      null
    >,
  },
} as const;

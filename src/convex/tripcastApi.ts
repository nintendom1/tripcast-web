import { anyApi } from "convex/server";
import type { FunctionReference } from "convex/server";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type Role = "traveler" | "follower";

export type StoryImageSize = "compact" | "medium" | "large";

export type CheckpointSource = "right_click" | "tap_add_mode" | "long_press" | "current_activity" | "inline_form" | "fan_menu" | "replay_breadcrumb";

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
  imageWidth?: number;
  imageHeight?: number;
  imageSize?: StoryImageSize;
  source: CheckpointSource;
  /** Optional link to the mission a Story narrates (Complete-as-story flow). */
  missionId?: string;
  /** Editable retroactive "Happened at" time. Falls back to createdAt for
   *  chronological sorting (Journal, Story navigation, Trail, Replay). */
  happenedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type CheckpointMapPin = {
  _id: string;
  lat?: number;
  lon?: number;
  happenedAt?: number;
  createdAt: number;
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
  imageWidth?: number;
  imageHeight?: number;
  imageSize?: StoryImageSize;
  source: CheckpointSource;
  // Optional link back to the mission a Story narrates. Persisted on
  // the checkpoint and threaded into the emitted story event so
  // the Story tab can fold the paired mission_completed row.
  missionId?: string;
  // Optional retroactive "Happened at" time. When provided the story
  // journal event's occurredAt is set to this instead of the server clock.
  happenedAt?: number;
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
  tripId?: string;
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
  imageWidth?: number;
  imageHeight?: number;
  imageSize?: StoryImageSize;
  clearImage?: boolean;
  /** Editable retroactive "Happened at" time. Patches the checkpoint and
   *  the linked story journal event's occurredAt in lock-step. */
  happenedAt?: number;
  tripId?: string;
};

export type DeleteCheckpointArgs = {
  token: string;
  checkpointId: string;
  tripId?: string;
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

export type MissionSource = "route_vote" | "follower" | "traveler" | "mystery";

export type MissionModerationMode = "manual_review" | "auto_publish";

export type MissionRateLimitPreset = "off" | "per_second" | "per_minute" | "per_hour" | "per_day";

export type TravelerLocation = {
  lat: number;
  lon: number;
  accuracy?: number;
  isSharing: true;
  /** Set while the Traveler is parked; the location stays fresh for 12 hours after it. */
  parkedAt?: number;
} | null;

export type LiveTrailSample = {
  compact?: boolean;
  breakBefore?: boolean;
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
};

export type NativeLocationSampleReason =
  | "distance"
  | "turn"
  | "heartbeat"
  | "force"
  | "recovery"
  | "foreground";

export type NativeLocationSampleInput = {
  clientSampleId: string;
  lat: number;
  lon: number;
  accuracy?: number;
  sampledAt: number;
  recordTrail: boolean;
  publishCurrentLocation?: boolean;
  reason: NativeLocationSampleReason;
  /** Sent only on the phone's parked marker. */
  parked?: boolean;
  /** Capture trip, stamped at capture from getCurrentTrip. Absent from iOS builds before multi-trip. */
  tripId?: string;
  /** Publishing epoch at capture, sent with tripId. */
  epoch?: number;
};

export type NativeLocationPublishing = {
  state: "current" | "revoked";
  currentTripId: string;
  epoch: number;
};

export type NativeLocationBatchResult = {
  /** Every classified sample is listed here, including historical, quarantined and discarded ones. */
  acceptedClientSampleIds: string[];
  duplicateClientSampleIds: string[];
  currentLocationUpdated: boolean;
  currentLocationConfirmed: boolean;
  currentLocationSampledAt: number | null;
  serverAcknowledgedAt: number;
  trailInsertedCount: number;
  mysteryMissionSync?: NativeMysteryMissionSync;
  publishing?: NativeLocationPublishing;
  /** Stale-epoch samples captured before the switch: trail only, into the capture trip. */
  historicalClientSampleIds?: string[];
  /** Untagged samples after the first switch, held in quarantine. */
  quarantinedClientSampleIds?: string[];
  /** Samples written nowhere (sharing revoked, unknown trip or future epoch). */
  discardedClientSampleIds?: string[];
};

export type NativeMysteryMission = {
  mysteryMissionDocumentId: string;
  stablePackId: string;
  linkedMissionId: string;
  lat: number;
  lon: number;
  resolveRadiusMeters: number;
  narration: string;
  priority: number;
  expiresAt?: number;
  updatedAt: number;
  debugOnly?: boolean;
};

export type NativeMysteryMissionSync = {
  enabled: boolean;
  revision: number;
  debugIncluded?: boolean;
  missions: NativeMysteryMission[];
};

export type NativeMysteryCompletionOutcome =
  | "completed"
  | "already_completed"
  | "ineligible"
  | "not_found";

export type LatestLiveTrailSample = LiveTrailSample | FollowerLiveTrailSample | null;

export type NearestLiveTrailSampleResult = {
  capturedAtMs: number;
  sample: LiveTrailSample | null;
  deltaMs: number | null;
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

export type PaginationOpts = {
  numItems: number;
  cursor: string | null;
  endCursor?: string | null;
  maximumRowsRead?: number;
  maximumBytesRead?: number;
};

export type LiveTrailReplayPage = {
  page: LiveTrailSample[];
  hasMore: boolean;
  reachedTrueEnd: boolean;
  continueCursor: string;
  effectiveStartAt: number | null;
  effectiveEndAt: number | null;
  scanBoundaryAt: number | null;
};

export type ReplayStoryPage = {
  page: JournalEvent[];
  hasMore: boolean;
  reachedTrueEnd: boolean;
  continueCursor: string;
  effectiveStartAt: number | null;
  effectiveEndAt: number | null;
  scanBoundaryAt: number | null;
};

export type ReplayResumeTarget = {
  eventId: string;
  occurredAt: number;
  kind: "checkpoint" | "breadcrumb";
} | null;

export type LinkedMissionAction = "planned" | "visible" | "leave";

export type ReactionTargetType = "checkpoint" | "mission" | "route_vote";

/**
 * Aggregated reactions for a single target (checkpoint / mission / route vote).
 * Entries is an array (not a record keyed by emoji) because Convex object keys
 * must be ASCII — emoji characters cannot be used as field names.
 */
export type ReactionSummary = {
  /** Per-emoji counts. Empty array means no reactions. Order is not guaranteed. */
  entries: Array<{ emoji: string; count: number }>;
  /** The emoji character the current user reacted with, if any. */
  myReaction?: string;
};

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
  reactions?: ReactionSummary;
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
  myViewState?: {
    seenAt?: number;
    lastOpenedAt?: number;
    submittedAt?: number;
  };
  visibleComments: Array<{
    submissionId: string;
    comment: string;
    commentVisibility: CommentVisibility;
    author: string;
  }>;
  optionVoteCounts?: Record<string, number>;
  totalSubmissions?: number;
  reactions?: ReactionSummary;
};

export type RouteVoteSummary = {
  _id: string;
  title: string;
  effectiveStatus: RouteVoteStatus;
  options: Array<{ _id: string; title: string }>;
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
  sourceMysteryMissionId?: string;
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
  reactions?: ReactionSummary;
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

export type MysteryMissionState = "signal" | "revealed" | "dismissed";

export type MysteryMissionFeedItem = {
  kind: "mystery_mission";
  _id: string;
  mysteryMissionId: string;
  developerTest?: boolean;
  state: MysteryMissionState;
  lat: number;
  lon: number;
  region?: string;
  mysteryText: string;
  trueIntent?: string;
  locationName?: string;
  spoilerSummary?: string;
  spawnRadiusMiles: number;
  resolveRadiusMeters: number;
  priority: number;
  tags?: string[];
  recommendedTimeOfDay?: string;
  estimatedVisitMinutes?: number;
  difficulty?: string;
  locationType?: string;
  indoorOutdoor?: string;
  transitFriendly?: boolean;
  requiresTicket?: boolean;
  timeSensitive?: boolean;
  completedAt?: number;
  dismissedAt?: number;
  signalRevealedAt?: number;
  debugOnly?: boolean;
  linkedCheckpointId?: string;
  linkedMissionId?: string;
  distanceMiles?: number;
};

export type MysteryMissionFeed = {
  rows: MysteryMissionFeedItem[];
  meta: {
    suppressedByVelocity: boolean;
    travelerLocationKnown: boolean;
    displayLimit: number;
  };
};

export type MysteryMissionMapPins = {
  rows: MysteryMissionFeedItem[];
};

export type MysteryMissionImportPreview = {
  valid: boolean;
  maxMissions: number;
  counts: { total: number; create: number; update: number };
  existingIds: string[];
  errors: Array<{ index?: number; id?: string; field?: string; message: string }>;
  rows: Array<{
    index: number;
    id: string;
    region?: string;
    tags?: string[];
    difficulty?: string;
    estimatedVisitMinutes?: number;
    priority: number;
  }>;
};

export type MysteryMissionImportResult = {
  imported: number;
  created: number;
  updated: number;
};

export type MysteryMissionExportRow = {
  _id: string;
  id: string;
  developerTest?: boolean;
  lat: number;
  lon: number;
  region?: string;
  locationName?: string;
  mysteryText: string;
  trueIntent: string;
  spawnRadiusMiles: number;
  resolveRadiusMeters: number;
  priority: number;
  tags?: string[];
  recommendedTimeOfDay?: string;
  estimatedVisitMinutes?: number;
  difficulty?: string;
  sourceHint?: string;
  expiresAt?: number;
  spoilerSummary?: string;
  locationType?: string;
  indoorOutdoor?: string;
  transitFriendly?: boolean;
  requiresTicket?: boolean;
  timeSensitive?: boolean;
  completedAt?: number;
  dismissedAt?: number;
  signalRevealedAt?: number;
  linkedCheckpointId?: string;
  linkedMissionId?: string;
};

export type MysteryMissionManagementList = {
  settings: { enabled: boolean; revealIntervalHours: number };
  counts: {
    total: number;
    signal: number;
    dormant: number;
    completed: number;
    dismissed: number;
  };
  rows: MysteryMissionExportRow[];
};

export type MysteryMissionExport = {
  version: 1;
  exportedAt: number;
  missions: MysteryMissionExportRow[];
};

export type DeveloperTestMysteryMissionResult = {
  mysteryMissionId: string;
  linkedMissionId: string;
  lat: number;
  lon: number;
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
  | "popular"
  | "wayfinder"
  | "clutch_call"
  | "photo_worthy"
  | "budget_saver"
  | "local_legend";

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

export type CurrentActivityStalenessSettings = {
  enabled: boolean;
  fallbackTitle: string;
  fallbackEmoji?: string;
  resetAfterMs: number;
  updatedAt: number | null;
  updatedBySessionId: string | null;
};

export type QuickActivity = {
  label: string;
  emoji: string;
};

export type QuickActivitySettings = {
  activities: QuickActivity[];
  displayCount: number;
  updatedAt: number | null;
  updatedBySessionId: string | null;
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
  sleepHoursEnabled: boolean;
  sleepStartMinutes?: number;
  sleepEndMinutes?: number;
  sleepStaleThresholdMs: number;
  followerContentCutoffAt?: number;
  followerContentCutoffEnabled: boolean;
  themeDayStartMinutes?: number;
  themeNightStartMinutes?: number;
  movementDetectionEnabled?: boolean;
  movementWalkingLabel?: string;
  movementWalkingEmoji?: string;
  movementWalkingThresholdMps?: number;
  movementRunningLabel?: string;
  movementRunningEmoji?: string;
  movementCyclingLabel?: string;
  movementCyclingEmoji?: string;
  movementVehicleLabel?: string;
  movementVehicleEmoji?: string;
  movementMovingLabel?: string;
  movementMovingEmoji?: string;
  movementMovingThresholdMps?: number;
  movementOverridesSleep?: boolean;
  updatedAt: number | null;
};

export type TravelerPreferencesForFollower =
  | { visible: false; liveTrailVisibleToFollowers: boolean }
  | {
      visible: true;
      liveTrailVisibleToFollowers: boolean;
      travelerTimeZone?: string;
      allowFollowersTripPath: boolean;
      followerContentCutoffAt?: number;
      themeDayStartMinutes?: number;
      themeNightStartMinutes?: number;
    };

export type OldestContentRef = {
  timestamp: number;
  sourceType: "story" | "mission";
} | null;

export type ContentBeforeCutoffCounts = {
  stories: number;
  missions: number;
  trailSamples: number;
  routeVotes: number;
};

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
  tripId?: string;
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
  imageWidth?: number;
  imageHeight?: number;
  imageSize?: StoryImageSize;
  checkpointId?: string;
  routeVoteId?: string;
  missionId?: string;
  reactions?: ReactionSummary;
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

export type TravelFundsBudgetMode = "trip" | "daily";

export type TravelFundsCarryoverMode = "none" | "overspend_only";

export type TravelFundsConfigForTraveler =
  | { enabled: false }
  | {
      enabled: true;
      startingBudgetUsd: number;
      budgetMode: TravelFundsBudgetMode;
      carryoverMode: TravelFundsCarryoverMode;
      fundsStartAt?: number;
      budgetLabel?: string;
      remainingUsd: number;
      spentUsd: number;
      carryoverDebtUsd: number;
    };

export type TravelFundsSummaryForFollower =
  | { enabled: false }
  | {
      enabled: true;
      startingBudgetUsd: number;
      budgetMode: TravelFundsBudgetMode;
      carryoverMode: TravelFundsCarryoverMode;
      fundsStartAt?: number;
      budgetLabel?: string;
      remainingUsd: number;
      spentUsd: number;
      carryoverDebtUsd: number;
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
  tripId?: string;
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
  /** Selective unlink. JSON drops undefined on the wire, so callers send
   *  field names here to explicitly clear specific link fields. */
  clearLinks?: Array<"activity" | "mission" | "checkpoint">;
  occurredAt?: number;
  tripId?: string;
};

export type UpdateTravelFundsConfigArgs = {
  token: string;
  featureEnabled?: boolean;
  startingBudgetUsd?: number;
  budgetMode?: TravelFundsBudgetMode;
  carryoverMode?: TravelFundsCarryoverMode;
  fundsStartAt?: number;
  budgetLabel?: string;
  tripId?: string;
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

export type CloakingPin = {
  _id: string;
  lat: number;
  lon: number;
  radiusMeters: number;
  label?: string;
  createdAt: number;
};

export type InviteStatus = {
  status: "valid" | "expired" | "already_used" | "invalid";
};

// ---------------------------------------------------------------------------
// Ticker types
// ---------------------------------------------------------------------------

export type TickerMessage = {
  id: string;
  text: string;
  kind?: "alert" | "fact" | "tip";
};

export type TickerSettings = {
  enabled: boolean;
  priorityMessages: TickerMessage[];
  funFacts: TickerMessage[];
  tips: TickerMessage[];
  funFactsEnabled: boolean;
  tipsEnabled: boolean;
  funFactIntervalMinutes: number;
  funFactWeight: number;
  tipWeight: number;
  showPriorityToFollowers: boolean;
  showFunFactsToFollowers: boolean;
  showTipsToFollowers: boolean;
};

// ---------------------------------------------------------------------------
// Bulk Import types
// ---------------------------------------------------------------------------

export type BulkImportKind = "checkin" | "story" | "transaction" | "mission" | "route_vote" | "mystery_mission" | "ticker_fact" | "ticker_tip" | "live_trail_sample";
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
      kind: "mystery_mission";
      ref?: string;
      id?: string;
      mysteryMissionId?: string;
      timeZone?: string;
      lat: number;
      lon: number;
      region?: string;
      locationName?: string;
      mysteryText: string;
      trueIntent: string;
      spawnRadiusMiles?: number;
      resolveRadiusMeters?: number;
      priority?: number;
      tags?: string[];
      recommendedTimeOfDay?: string;
      estimatedVisitMinutes?: number;
      difficulty?: string;
      sourceHint?: string;
      expiresAt?: BulkImportTimestamp;
      spoilerSummary?: string;
      locationType?: string;
      indoorOutdoor?: string;
      transitFriendly?: boolean;
      requiresTicket?: boolean;
      timeSensitive?: boolean;
      completedAt?: BulkImportTimestamp;
      dismissedAt?: BulkImportTimestamp;
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
    }
  | {
      kind: "ticker_fact" | "fact";
      ref?: string;
      text?: string;
      fact?: string;
      title?: string;
    }
  | {
      kind: "ticker_tip" | "tip";
      ref?: string;
      text?: string;
      tip?: string;
      title?: string;
    }
  | {
      kind: "live_trail_sample" | "breadcrumb";
      ref?: string;
      timeZone?: string;
      lat: number;
      lon: number;
      accuracy?: number;
      sampledAt?: BulkImportTimestamp;
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
  mysteryMissions: number;
  tickerFacts: number;
  tickerTips: number;
  liveTrailSamples: number;
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

export type PhotoCompanionPageItem = {
  pinRef: string;
  imageId: string;
  url: string | null;
  contentType: string | null;
  bytes: number | null;
  sha256: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  imageSize: StoryImageSize | null;
  missingReason: "storage_missing" | "url_unavailable" | null;
};

export type PhotoCompanionPage = {
  page: PhotoCompanionPageItem[];
  continueCursor: string;
  isDone: boolean;
};

export type PhotoResolutionResult = {
  pinRef: string;
  status: "ready" | "already_has_photo" | "unmatched" | "ambiguous";
  checkpointId?: string;
};

export type ResolvePhotoCompanionRefsResult = PhotoResolutionResult[];

export type PhotoAttachmentInput = {
  ref: string;
  imageId: string;
  sha256: string;
  bytes: number;
  contentType:
    | "image/jpeg"
    | "image/png"
    | "image/webp"
    | "image/gif"
    | "image/avif"
    | "image/heic"
    | "image/heif";
  imageWidth?: number;
  imageHeight?: number;
  imageSize?: StoryImageSize;
};

export type PhotoAttachmentResult = {
  pinRef: string;
  imageId: string;
  status:
    | "attached"
    | "already_has_photo"
    | "unmatched"
    | "ambiguous"
    | "duplicate_input"
    | "duplicate_target"
    | "image_already_attached"
    | "invalid_storage"
    | "metadata_mismatch";
  message?: string;
};

export type AttachPhotoCompanionBatchResult = PhotoAttachmentResult[];

export type OrphanPhotoItem = {
  imageId: string;
  contentType: string | null;
  bytes: number;
  sha256: string;
  creationTime: number;
};

export type AuditOrphanPhotoPageResult = {
  page: OrphanPhotoItem[];
  continueCursor: string;
  isDone: boolean;
};

export type PruneOrphanResult = {
  imageId: string;
  status: "deleted" | "now_referenced" | "missing" | "rejected";
};

export type TickerFactExportEntry = {
  kind: "ticker_fact";
  ref: string;
  text: string;
};

export type TickerFactExport = {
  entries: TickerFactExportEntry[];
};

export type TickerExportEntry = {
  kind: "ticker_fact" | "ticker_tip";
  ref: string;
  text: string;
};

export type TickerExport = {
  entries: TickerExportEntry[];
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

/** The trip Followers currently see (the shared current trip). Key Follower caches by tripId. */
export type EffectiveTrip = {
  tripId: string;
  title: string;
  lifecycle: TripLifecycle;
  isLegacy: boolean;
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
// Trips (multi-trip catalog, current pointer, lifecycle)
// ---------------------------------------------------------------------------

export type TripLifecycle = "planned" | "in_progress" | "completed" | "archived";

export type TripPreviewStatus = "none" | "building" | "ready" | "failed";

export type TripCounts = {
  storyCount: number;
  missionCount: number;
  routeVoteCount: number;
};

/** One catalog card. Small fields only; the route sketch comes from getTripPreview. */
export type TripCard = TripCounts & {
  tripId: string;
  title: string;
  destinationSummary?: string;
  plannedStartAt?: number;
  plannedEndAt?: number;
  startedAt?: number;
  endedAt?: number;
  lifecycle: TripLifecycle;
  /** Lifecycle before archiving; Restore returns to it. */
  archivedFrom?: Exclude<TripLifecycle, "archived">;
  isLegacy: boolean;
  /** The shared current trip (what Followers see). */
  isCurrent: boolean;
  /** Set while a per-trip delete is running ("Deleting…"). */
  deletingAt?: number;
  revision: number;
  updatedAt: number;
  lastStoryAt?: number;
  latestActivityAt?: number;
  previewStatus: TripPreviewStatus;
  /** Memoise previews by `tripId:previewVersion`. */
  previewVersion: number;
};

export type TripCardPage = {
  page: TripCard[];
  isDone: boolean;
  continueCursor: string;
};

export type TripPreviewRoute = {
  version: number;
  bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number };
  /** At most 128 points. */
  points: { lat: number; lon: number }[];
  builtAt: number;
  sourceSampleCount: number;
};

export type TripPreview = TripCounts & {
  tripId: string;
  previewStatus: TripPreviewStatus;
  previewVersion: number;
  /** null until a preview has been built (show placeholder metadata). */
  route: TripPreviewRoute | null;
  coverImageUrl: string | null;
};

/** The shared current trip and publishing state. Drives the native publishing config. */
export type CurrentTrip = {
  tripId: string;
  title: string;
  lifecycle: TripLifecycle;
  isLegacy: boolean;
  /** travelerTripState revision; send as expectedRevision to setCurrentTrip. */
  revision: number;
  publishingEpoch: number;
  epochStartedAt: number;
  firstSwitchAt?: number;
  multiTripEnabled: boolean;
};

/** "defaults" copies nothing (code defaults apply); otherwise a trip id to copy settings from. */
export type TripSettingsSource = "defaults" | (string & {});

export type CreateTripArgs = {
  token: string;
  title: string;
  destinationSummary?: string;
  plannedStartAt?: number;
  plannedEndAt?: number;
  copySettingsFrom: TripSettingsSource;
};

/** Fields to change; null clears an optional field. */
export type TripDetailsPatch = {
  title?: string;
  destinationSummary?: string | null;
  plannedStartAt?: number | null;
  plannedEndAt?: number | null;
};

/** What changes for Followers if `tripId` becomes the shared current trip. */
export type TripSwitchImpact = {
  fromTrip: { tripId: string; title: string; lifecycle: TripLifecycle };
  toTrip: { tripId: string; title: string; lifecycle: TripLifecycle };
  /** travelerTripState revision to send with setCurrentTrip. */
  expectedRevision: number;
  /** Live location sharing is on (it stops on every device). */
  isLive: boolean;
  /** Open votes and an active activity stay on the old trip. */
  openRouteVoteCount: number;
  hasActiveActivity: boolean;
  /** Last upload from an iOS build without trip tags; the client applies the 7-day window. */
  lastUntaggedIngestAt?: number;
};

// ---------------------------------------------------------------------------
// API namespace
// ---------------------------------------------------------------------------

export type ReplayImageInventoryItem = { source: string; bytes: number; status: "pending" | "ready" | "failed"; previewBytes: number };
export type ReplayRoutePreviewPoint = { id: string; lat: number; lon: number; t: number; breakBefore?: boolean; kept: boolean };
export type ReplayRoutePreview = { points: ReplayRoutePreviewPoint[]; day: number | null; cursor: string | null; done: boolean; sourceRevision: string; compressionVersion: number };
export type ReplayRouteManifest = { originalOnly: boolean; sourceRevision: string; compressionVersion: number; contentRevision: number; revision: number; ready: boolean; enabled: boolean; visible: boolean; cutoff: number | null; authorization: string; ended: boolean };
export type ReplayRouteMetrics = { days: number; truncated: boolean; rawPoints: number; retainedPoints: number; chunks: number; payloadBytes: number; mysteryReady: boolean; checkpointPinsReady: boolean };
export const tripcastApi = {
  replayRoutes: {
    preview: (anyApi as any).replayRoutes.preview as FunctionReference<"query", "public", { token: string; sourceRevision: string; compressionVersion: number; day: number | null; cursor: string | null; tripId?: string }, ReplayRoutePreview>,
    manifest: (anyApi as any).replayRoutes.manifest as FunctionReference<"query", "public", { token: string; tripId?: string }, ReplayRouteManifest>,
    prepare: (anyApi as any).replayRoutes.prepare as FunctionReference<"mutation", "public", { token: string; sourceRevision?: string; compressionVersion?: number; tripId?: string }, null>,
    enable: (anyApi as any).replayRoutes.enable as FunctionReference<"mutation", "public", { token: string; enabled: boolean; tripId?: string }, null>,
    metrics: (anyApi as any).replayRoutes.metrics as FunctionReference<"query", "public", { token: string; tripId?: string }, ReplayRouteMetrics>,
    page: (anyApi as any).replayRoutes.page as FunctionReference<"query", "public", { token: string; revision: number; startAt?: number; endAt?: number; direction: "asc" | "desc"; cursor: string | null; tripId?: string }, LiveTrailReplayPage>,
  },
  replayImages: {
    preference: (anyApi as any).replayImages.preference as FunctionReference<"query", "public", { token: string }, { original: boolean }>,
    setPreference: (anyApi as any).replayImages.setPreference as FunctionReference<"mutation", "public", { token: string; original: boolean }, null>,
    resolveUrl: (anyApi as any).replayImages.resolveUrl as FunctionReference<"query", "public", { token: string; imageId: string; context: "story" | "replay"; original?: boolean; tripId?: string }, { url: string; original: boolean } | null>,
    inventory: (anyApi as any).replayImages.inventory as FunctionReference<"query", "public", { token: string; paginationOpts: { numItems: number; cursor: string | null }; tripId?: string }, { page: ReplayImageInventoryItem[]; isDone: boolean; continueCursor: string }>,
    acquire: (anyApi as any).replayImages.acquire as FunctionReference<"mutation", "public", { token: string; owner: string }, boolean>,
    claim: (anyApi as any).replayImages.claim as FunctionReference<"mutation", "public", { token: string; owner: string; source: string; tripId?: string }, { originalUrl: string | null } | null>,
    finish: (anyApi as any).replayImages.finish as FunctionReference<"action", "public", { token: string; owner: string; source: string; bytes: ArrayBuffer; width: number; height: number; tripId?: string }, boolean>,
    fail: (anyApi as any).replayImages.fail as FunctionReference<"mutation", "public", { token: string; owner: string; source: string; tripId?: string }, null>,
    release: (anyApi as any).replayImages.release as FunctionReference<"mutation", "public", { token: string; owner: string }, null>,
    getUrl: (anyApi as any).replayImages.getUrl as FunctionReference<"query", "public", { token: string; imageId: string; tripId?: string }, string | null>,
  },
  photoCompanion: {
    travelerListPhotoCompanionPage: (anyApi as any).photoCompanion.travelerListPhotoCompanionPage as FunctionReference<
      "query",
      "public",
      { token: string; paginationOpts: PaginationOpts; startMs?: number; endMs?: number; tripId?: string },
      PhotoCompanionPage
    >,
    travelerResolvePhotoCompanionRefs: (anyApi as any).photoCompanion.travelerResolvePhotoCompanionRefs as FunctionReference<
      "query",
      "public",
      { token: string; refs: string[]; tripId?: string },
      ResolvePhotoCompanionRefsResult
    >,
    travelerGeneratePhotoImportUploadUrls: (anyApi as any).photoCompanion.travelerGeneratePhotoImportUploadUrls as FunctionReference<
      "mutation",
      "public",
      { token: string; count: number },
      string[]
    >,
    travelerAttachPhotoCompanionBatch: (anyApi as any).photoCompanion.travelerAttachPhotoCompanionBatch as FunctionReference<
      "mutation",
      "public",
      { token: string; attachments: PhotoAttachmentInput[]; tripId?: string },
      AttachPhotoCompanionBatchResult
    >,
    travelerAuditOrphanPhotoPage: (anyApi as any).photoCompanion.travelerAuditOrphanPhotoPage as FunctionReference<
      "query",
      "public",
      { token: string; paginationOpts: PaginationOpts; tripId?: string },
      AuditOrphanPhotoPageResult
    >,
    travelerPruneOrphanPhotos: (anyApi as any).photoCompanion.travelerPruneOrphanPhotos as FunctionReference<
      "mutation",
      "public",
      { token: string; imageIds: string[]; tripId?: string },
      PruneOrphanResult[]
    >,
  },
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
      { token: string; entries: BulkImportPayload; tripId?: string },
      BulkImportResult
    >,
    travelerExportTripData: (anyApi as any).bulkImport.travelerExportTripData as FunctionReference<
      "query",
      "public",
      { token: string; startMs?: number; endMs?: number; includeMysteryMissions?: boolean; includeLiveTrail?: boolean; liveTrailLimit?: number; tripId?: string },
      BulkImportPayload
    >,
    travelerCountExportEntries: (anyApi as any).bulkImport.travelerCountExportEntries as FunctionReference<
      "query",
      "public",
      { token: string; startMs?: number; endMs?: number; includeMysteryMissions?: boolean; tripId?: string },
      { otherCount: number; breadcrumbCount: number }
    >,
    travelerExportTickerFacts: (anyApi as any).bulkImport.travelerExportTickerFacts as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      TickerFactExport
    >,
    travelerExportTickerMessages: (anyApi as any).bulkImport.travelerExportTickerMessages as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      TickerExport
    >,
  },
  auth: {
    signIn: (anyApi as any).auth.signIn as FunctionReference<
      "mutation",
      "public",
      { role: "traveler"; code: string; clientId: string },
      { ok: true; token: string; role: "traveler" } | { ok: false; error: "invalid_code" }
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
      { token: string; tripId?: string },
      Checkpoint[]
    >,
    listCheckpointMapPins: (anyApi as any).checkpoints.listCheckpointMapPins as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      CheckpointMapPin[]
    >,
    getStoryImageUrl: (anyApi as any).checkpoints.getStoryImageUrl as FunctionReference<
      "query",
      "public",
      { token: string; imageId: string; tripId?: string },
      string | null
    >,
    getStoryImageSizes: (anyApi as any).checkpoints.getStoryImageSizes as FunctionReference<
      "query",
      "public",
      { token: string; imageIds: string[] },
      Array<{ imageId: string; size: number }>
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
      { token: string; tripId?: string },
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
      { token: string; tripId?: string },
      null
    >,
    deleteCurrentActivity: (anyApi as any).privacy.deleteCurrentActivity as FunctionReference<
      "mutation",
      "public",
      { token: string; tripId?: string },
      null
    >,
  },
  travelerLocations: {
    updateTravelerLocation: (anyApi as any).routeVotes.updateTravelerLocation as FunctionReference<
      "mutation",
      "public",
      { token: string; lat: number; lon: number; accuracy?: number; tripId?: string; publishingEpoch?: number },
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
  nativeLocationIngest: {
    travelerIngestNativeLocationBatch: (anyApi as any).nativeLocationIngest.travelerIngestNativeLocationBatch as FunctionReference<
      "mutation",
      "public",
      { token: string; samples: NativeLocationSampleInput[]; includeDebugMysteryMissions?: boolean; knownMysteryMissionSyncRevision?: number },
      NativeLocationBatchResult
    >,
  },
  liveTrail: {
    travelerSetLiveTrailEnabled: (anyApi as any).liveTrail.travelerSetLiveTrailEnabled as FunctionReference<
      "mutation",
      "public",
      { token: string; enabled: boolean; tripId?: string },
      null
    >,
    travelerSetLiveTrailVisibility: (anyApi as any).liveTrail.travelerSetLiveTrailVisibility as FunctionReference<
      "mutation",
      "public",
      { token: string; visibleToFollowers: boolean; tripId?: string },
      null
    >,
    travelerRecordLiveTrailSample: (anyApi as any).liveTrail.travelerRecordLiveTrailSample as FunctionReference<
      "mutation",
      "public",
      { token: string; lat: number; lon: number; accuracy?: number; sampledAt?: number; tripId?: string; publishingEpoch?: number },
      null
    >,
    travelerDeleteRecentLiveTrail: (anyApi as any).liveTrail.travelerDeleteRecentLiveTrail as FunctionReference<
      "mutation",
      "public",
      { token: string; recentMs?: number; tripId?: string },
      { deleted: number }
    >,
    travelerPreviewLiveTrailDeleteRange: (anyApi as any).liveTrail.travelerPreviewLiveTrailDeleteRange as FunctionReference<
      "query",
      "public",
      { token: string; startDate: string; endDate: string; timeZone: string; tripId?: string },
      LiveTrailDeletePreview
    >,
    travelerDeleteLiveTrailRange: (anyApi as any).liveTrail.travelerDeleteLiveTrailRange as FunctionReference<
      "mutation",
      "public",
      { token: string; startDate: string; endDate: string; timeZone: string; tripId?: string },
      { deleted: number }
    >,
    travelerDeleteLiveTrailSamples: (anyApi as any).liveTrail.travelerDeleteLiveTrailSamples as FunctionReference<
      "mutation",
      "public",
      { token: string; sampleIds: string[]; tripId?: string },
      { deleted: number }
    >,
    travelerGetLiveTrailStatus: (anyApi as any).liveTrail.travelerGetLiveTrailStatus as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      LiveTrailStatus
    >,
    getLatestLiveTrailSample: (anyApi as any).liveTrail.getLatestLiveTrailSample as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      LatestLiveTrailSample
    >,
    travelerFindNearestLiveTrailSamples: (anyApi as any).liveTrail.travelerFindNearestLiveTrailSamples as FunctionReference<
      "query",
      "public",
      { token: string; capturedAtMs: number[]; tripId?: string },
      NearestLiveTrailSampleResult[]
    >,
    listReplayLiveTrailSamples: (anyApi as any).liveTrail.listReplayLiveTrailSamples as FunctionReference<
      "query",
      "public",
      {
        token: string;
        paginationOpts: PaginationOpts;
        startAt?: number;
        endAt?: number;
        direction: "asc" | "desc";
        tripId?: string;
      },
      LiveTrailReplayPage
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
        tripId?: string;
      },
      string
    >,
    travelerCloseRouteVote: (anyApi as any).routeVotes.travelerCloseRouteVote as FunctionReference<
      "mutation",
      "public",
      { token: string; routeVoteId: string; tripId?: string },
      null
    >,
    travelerCancelRouteVote: (anyApi as any).routeVotes.travelerCancelRouteVote as FunctionReference<
      "mutation",
      "public",
      { token: string; routeVoteId: string; tripId?: string },
      null
    >,
    travelerArchiveRouteVote: (anyApi as any).routeVotes.travelerArchiveRouteVote as FunctionReference<
      "mutation",
      "public",
      { token: string; routeVoteId: string; tripId?: string },
      null
    >,
    travelerConfirmRouteVoteWinner: (anyApi as any).routeVotes.travelerConfirmRouteVoteWinner as FunctionReference<
      "mutation",
      "public",
      { token: string; routeVoteId: string; winningOptionId: string; linkedMissionAction?: LinkedMissionAction; tripId?: string },
      string
    >,
    travelerHideRouteVoteComment: (anyApi as any).routeVotes.travelerHideRouteVoteComment as FunctionReference<
      "mutation",
      "public",
      { token: string; submissionId: string; tripId?: string },
      null
    >,
    travelerUpdateMissionStatus: (anyApi as any).routeVotes.travelerUpdateMissionStatus as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string; newStatus: MissionStatus; tripId?: string },
      null
    >,
    markRouteVoteSeen: (anyApi as any).routeVotes.markRouteVoteSeen as FunctionReference<
      "mutation",
      "public",
      { token: string; routeVoteId: string; tripId?: string },
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
        tripId?: string;
      },
      null
    >,
    travelerListRouteVotes: (anyApi as any).routeVotes.travelerListRouteVotes as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      RouteVoteListItem[]
    >,
    travelerGetRouteVoteDetail: (anyApi as any).routeVotes.travelerGetRouteVoteDetail as FunctionReference<
      "query",
      "public",
      { token: string; routeVoteId: string; tripId?: string },
      RouteVoteDetail | null
    >,
    getActiveRouteVoteAlert: (anyApi as any).routeVotes.getActiveRouteVoteAlert as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      { hasUnseen: boolean }
    >,
    listVisibleRouteVotes: (anyApi as any).routeVotes.listVisibleRouteVotes as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      VisibleRouteVote[]
    >,
    getVisibleRouteVote: (anyApi as any).routeVotes.getVisibleRouteVote as FunctionReference<
      "query",
      "public",
      { token: string; routeVoteId: string; tripId?: string },
      VisibleRouteVote | null
    >,
    getRouteVoteSummary: (anyApi as any).routeVotes.getRouteVoteSummary as FunctionReference<
      "query",
      "public",
      { token: string; routeVoteId: string; tripId?: string },
      RouteVoteSummary | null
    >,
    getRouteVoteMapOverlay: (anyApi as any).routeVotes.getRouteVoteMapOverlay as FunctionReference<
      "query",
      "public",
      { token: string; routeVoteId: string; tripId?: string },
      RouteVoteMapOverlay
    >,
    travelerListPlannedMissions: (anyApi as any).routeVotes.travelerListPlannedMissions as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      Mission[]
    >,
  },
  missions: {
    followerProposeMission: (anyApi as any).missions.followerProposeMission as FunctionReference<
      "mutation",
      "public",
      { token: string; clientLocalDate?: string; tripId?: string } & MissionContentArgs,
      { missionId: string; autoPublished: boolean }
    >,
    followerWithdrawMission: (anyApi as any).missions.followerWithdrawMission as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string; tripId?: string },
      null
    >,
    travelerCreateMission: (anyApi as any).missions.travelerCreateMission as FunctionReference<
      "mutation",
      "public",
      { token: string; clientLocalDate?: string; tripId?: string } & MissionContentArgs,
      string
    >,
    travelerEditMission: (anyApi as any).missions.travelerEditMission as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string; tripId?: string } & MissionContentArgs,
      null
    >,
    travelerAcceptMission: (anyApi as any).missions.travelerAcceptMission as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string; responseNote?: string; responsePreset?: string; tripId?: string },
      null
    >,
    travelerDropMission: (anyApi as any).missions.travelerDropMission as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string; responseNote?: string; responsePreset?: string; silent?: boolean; tripId?: string },
      null
    >,
    travelerDeleteMission: (anyApi as any).missions.travelerDeleteMission as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string; tripId?: string },
      null
    >,
    travelerStartMission: (anyApi as any).missions.travelerStartMission as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string; tripId?: string },
      null
    >,
    travelerCompleteMission: (anyApi as any).missions.travelerCompleteMission as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string; transaction?: TransactionInlineInput; tripId?: string },
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
        imageWidth?: number;
        imageHeight?: number;
        imageSize?: StoryImageSize;
        transaction?: TransactionInlineInput;
        awardBadgeType?: BadgeType;
        tripId?: string;
      },
      string
    >,
    travelerToggleMissionMapPin: (anyApi as any).missions.travelerToggleMissionMapPin as FunctionReference<
      "mutation",
      "public",
      { token: string; missionId: string; hidden: boolean; tripId?: string },
      null
    >,
    travelerListMissions: (anyApi as any).missions.travelerListMissions as FunctionReference<
      "query",
      "public",
      { token: string; status?: MissionStatus; tripId?: string },
      Mission[]
    >,
    travelerGetMissionBadgeState: (anyApi as any).missions.travelerGetMissionBadgeState as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      { proposedCount: number }
    >,
    followerListMissions: (anyApi as any).missions.followerListMissions as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      Mission[]
    >,
    followerListMyMissions: (anyApi as any).missions.followerListMyMissions as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      { mine: Mission[]; public: Mission[] }
    >,
    getMission: (anyApi as any).missions.getMission as FunctionReference<
      "query",
      "public",
      { token: string; missionId: string; tripId?: string },
      Mission | null
    >,
    listMissionMapPins: (anyApi as any).missions.listMissionMapPins as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      Mission[]
    >,
  },
  missionSettings: {
    travelerGetMissionSettings: (anyApi as any).missionSettings.travelerGetMissionSettings as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      MissionSettings
    >,
    followerGetMissionSettings: (anyApi as any).missionSettings.followerGetMissionSettings as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      { moderationMode: MissionModerationMode }
    >,
    travelerUpdateMissionSettings: (anyApi as any).missionSettings.travelerUpdateMissionSettings as FunctionReference<
      "mutation",
      "public",
      { token: string; moderationMode?: MissionModerationMode; rateLimitPreset?: MissionRateLimitPreset; tripId?: string },
      null
    >,
  },
  mysteryMissions: {
    travelerGetMysteryMissionSettings: (anyApi as any).mysteryMissions.travelerGetMysteryMissionSettings as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      { enabled: boolean; revealIntervalHours: number; updatedAt: number | null }
    >,
    travelerSetMysteryMissionsEnabled: (anyApi as any).mysteryMissions.travelerSetMysteryMissionsEnabled as FunctionReference<
      "mutation",
      "public",
      { token: string; enabled: boolean; revealIntervalHours?: number; tripId?: string },
      null
    >,
    travelerCreateDeveloperTestMysteryMission: (anyApi as any).mysteryMissions.travelerCreateDeveloperTestMysteryMission as FunctionReference<
      "mutation",
      "public",
      { token: string; lat: number; lon: number; mysteryText: string; trueIntent: string; tripId?: string },
      DeveloperTestMysteryMissionResult
    >,
    previewMysteryMissionImport: (anyApi as any).mysteryMissions.previewMysteryMissionImport as FunctionReference<
      "query",
      "public",
      { token: string; payload: any; tripId?: string },
      MysteryMissionImportPreview
    >,
    travelerImportMysteryMissions: (anyApi as any).mysteryMissions.travelerImportMysteryMissions as FunctionReference<
      "mutation",
      "public",
      { token: string; payload: any; tripId?: string },
      MysteryMissionImportResult
    >,
    travelerListMysteryMissions: (anyApi as any).mysteryMissions.travelerListMysteryMissions as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      MysteryMissionManagementList
    >,
    travelerGetNativeMysteryMissionSync: (anyApi as any).mysteryMissions.travelerGetNativeMysteryMissionSync as FunctionReference<
      "query",
      "public",
      { token: string; includeDebugAll?: boolean; tripId?: string },
      NativeMysteryMissionSync
    >,
    travelerGetNativeMysteryMissionRevision: (anyApi as any).mysteryMissions.travelerGetNativeMysteryMissionRevision as FunctionReference<
      "query",
      "public",
      { token: string; includeDebugAll?: boolean },
      { revision: number; debugIncluded: boolean }
    >,
    travelerGetMysteryMissionForEdit: (anyApi as any).mysteryMissions.travelerGetMysteryMissionForEdit as FunctionReference<
      "query",
      "public",
      { token: string; mysteryMissionId: string; tripId?: string },
      MysteryMissionExportRow | null
    >,
    travelerExportMysteryMissions: (anyApi as any).mysteryMissions.travelerExportMysteryMissions as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      MysteryMissionExport
    >,
    listMysteryMissionFeed: (anyApi as any).mysteryMissions.listMysteryMissionFeed as FunctionReference<
      "query",
      "public",
      { token: string; includeDismissed?: boolean; tripId?: string },
      MysteryMissionFeed
    >,
    listMysteryMissionMapPins: (anyApi as any).mysteryMissions.listMysteryMissionMapPins as FunctionReference<
      "query",
      "public",
      { token: string; includeDebugAll?: boolean; tripId?: string },
      MysteryMissionMapPins
    >,
    getMysteryMission: (anyApi as any).mysteryMissions.getMysteryMission as FunctionReference<
      "query",
      "public",
      { token: string; mysteryMissionId: string; tripId?: string },
      MysteryMissionFeedItem | null
    >,
    travelerDismissMysteryMission: (anyApi as any).mysteryMissions.travelerDismissMysteryMission as FunctionReference<
      "mutation",
      "public",
      { token: string; mysteryMissionId: string; tripId?: string },
      null
    >,
    travelerCompleteMysteryMission: (anyApi as any).mysteryMissions.travelerCompleteMysteryMission as FunctionReference<
      "mutation",
      "public",
      { token: string; mysteryMissionId: string; checkpointId?: string; tripId?: string },
      null
    >,
    travelerCompleteMysteryMissionNative: (anyApi as any).mysteryMissions.travelerCompleteMysteryMissionNative as FunctionReference<
      "mutation",
      "public",
      { token: string; mysteryMissionId: string; clientTriggerId: string; debugArrival?: boolean; tripId?: string },
      { outcome: NativeMysteryCompletionOutcome }
    >,
    travelerPatchMysteryMission: (anyApi as any).mysteryMissions.travelerPatchMysteryMission as FunctionReference<
      "mutation",
      "public",
      {
        token: string;
        mysteryMissionId: string;
        lat?: number;
        lon?: number;
        region?: string;
        locationName?: string;
        mysteryText?: string;
        trueIntent?: string;
        spawnRadiusMiles?: number;
        resolveRadiusMeters?: number;
        priority?: number;
        tags?: string[];
        recommendedTimeOfDay?: string | null;
        estimatedVisitMinutes?: number | null;
        difficulty?: string | null;
        sourceHint?: string | null;
        expiresAt?: number | null;
        spoilerSummary?: string | null;
        locationType?: string | null;
        indoorOutdoor?: string | null;
        transitFriendly?: boolean | null;
        requiresTicket?: boolean | null;
        timeSensitive?: boolean | null;
        tripId?: string;
      },
      null
    >,
    travelerDeleteMysteryMission: (anyApi as any).mysteryMissions.travelerDeleteMysteryMission as FunctionReference<
      "mutation",
      "public",
      { token: string; mysteryMissionId: string; tripId?: string },
      null
    >,
  },
  currentActivity: {
    travelerSetCurrentActivity: (anyApi as any).currentActivity.travelerSetCurrentActivity as FunctionReference<"mutation", "public", { token: string; title: string; emoji?: string; note?: string; locationLabel?: string; lat?: number; lon?: number; linkedMissionId?: string; tripId?: string }, string>,
    travelerDropCurrentActivity: (anyApi as any).currentActivity.travelerDropCurrentActivity as FunctionReference<"mutation", "public", { token: string; activityId: string; tripId?: string }, null>,
    travelerCompleteCurrentActivity: (anyApi as any).currentActivity.travelerCompleteCurrentActivity as FunctionReference<"mutation", "public", { token: string; activityId: string; checkpointId: string; tripId?: string }, null>,
    travelerGetCurrentActivity: (anyApi as any).currentActivity.travelerGetCurrentActivity as FunctionReference<"query", "public", { token: string; tripId?: string }, CurrentActivity | null>,
    followerGetCurrentActivity: (anyApi as any).currentActivity.followerGetCurrentActivity as FunctionReference<"query", "public", { token: string; tripId?: string }, CurrentActivity | null>,
    travelerListRecentActivities: (anyApi as any).currentActivity.travelerListRecentActivities as FunctionReference<"query", "public", { token: string; tripId?: string }, CurrentActivity[]>,
    travelerGetStalenessSettings: (anyApi as any).currentActivity.travelerGetStalenessSettings as FunctionReference<"query", "public", { token: string; tripId?: string }, CurrentActivityStalenessSettings>,
    travelerUpdateStalenessSettings: (anyApi as any).currentActivity.travelerUpdateStalenessSettings as FunctionReference<"mutation", "public", { token: string; enabled: boolean; fallbackTitle: string; fallbackEmoji?: string; resetAfterMs: number; tripId?: string }, null>,
    travelerApplyMovementDetection: (anyApi as any).currentActivity.travelerApplyMovementDetection as FunctionReference<"mutation", "public", { token: string; classification: "walking" | "running" | "cycling" | "automotive" | "moving" | "stopped"; speedMps?: number; sampledAt: number; tripId?: string; publishingEpoch?: number }, null>,
    travelerGetQuickActivitySettings: (anyApi as any).currentActivity.travelerGetQuickActivitySettings as FunctionReference<"query", "public", { token: string; tripId?: string }, QuickActivitySettings>,
    travelerUpdateQuickActivitySettings: (anyApi as any).currentActivity.travelerUpdateQuickActivitySettings as FunctionReference<"mutation", "public", { token: string; activities: QuickActivity[]; displayCount: number; tripId?: string }, null>,
  },
  travelerState: {
    travelerGetState: (anyApi as any).travelerState.travelerGetState as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      { state: TravelerState | null; visibility: TravelerStateVisibility }
    >,
    followerGetTravelerState: (anyApi as any).travelerState.followerGetTravelerState as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      TravelerStateForFollower
    >,
    travelerListStateHistory: (anyApi as any).travelerState.travelerListStateHistory as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
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
        tripId?: string;
      },
      null
    >,
  },
  travelerAutoState: {
    travelerGetAutoState: (anyApi as any).travelerAutoState.travelerGetAutoState as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      AutoState
    >,
    followerGetAutoState: (anyApi as any).travelerAutoState.followerGetAutoState as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      AutoStateForFollower
    >,
    travelerSetAutoStateEnabled: (anyApi as any).travelerAutoState.travelerSetAutoStateEnabled as FunctionReference<
      "mutation",
      "public",
      { token: string; enabled: boolean; timeZone: string; tripId?: string },
      null
    >,
    travelerUpdateAutoStateSettings: (anyApi as any).travelerAutoState.travelerUpdateAutoStateSettings as FunctionReference<
      "mutation",
      "public",
      { token: string; tripId?: string } & AutoStateSettings,
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
        tripId?: string;
      },
      null
    >,
  },
  travelerPreferences: {
    travelerGetPreferences: (anyApi as any).travelerPreferences.travelerGetPreferences as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      TravelerPreferences
    >,
    followerGetPreferences: (anyApi as any).travelerPreferences.followerGetPreferences as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      TravelerPreferencesForFollower
    >,
    travelerSetTimeZone: (anyApi as any).travelerPreferences.travelerSetTimeZone as FunctionReference<
      "mutation",
      "public",
      { token: string; timeZone: string; source?: "device" | "manual"; tripId?: string },
      null
    >,
    travelerEnsureTimeZone: (anyApi as any).travelerPreferences.travelerEnsureTimeZone as FunctionReference<
      "mutation",
      "public",
      { token: string; timeZone: string; source?: "device" | "manual"; tripId?: string },
      { updated: boolean }
    >,
    travelerUpdatePreferences: (anyApi as any).travelerPreferences.travelerUpdatePreferences as FunctionReference<
      "mutation",
      "public",
      {
        token: string;
        allowFollowersTripPath?: boolean;
        followerContentCutoffAt?: number | null;
        followerContentCutoffEnabled?: boolean;
        themeDayStartMinutes?: number | null;
        themeNightStartMinutes?: number | null;
        tripId?: string;
      },
      null
    >,
    travelerUpdateSleepHours: (anyApi as any).travelerPreferences.travelerUpdateSleepHours as FunctionReference<
      "mutation",
      "public",
      {
        token: string;
        sleepHoursEnabled?: boolean;
        sleepStartMinutes?: number;
        sleepEndMinutes?: number;
        sleepStaleThresholdMs?: number;
        tripId?: string;
      },
      null
    >,
    travelerUpdateMovementDetection: (anyApi as any).travelerPreferences.travelerUpdateMovementDetection as FunctionReference<
      "mutation",
      "public",
      {
        token: string;
        movementDetectionEnabled?: boolean;
        movementWalkingLabel?: string;
        movementWalkingEmoji?: string;
        movementWalkingThresholdMps?: number;
        movementRunningLabel?: string;
        movementRunningEmoji?: string;
        movementCyclingLabel?: string;
        movementCyclingEmoji?: string;
        movementVehicleLabel?: string;
        movementVehicleEmoji?: string;
        movementMovingLabel?: string;
        movementMovingEmoji?: string;
        movementMovingThresholdMps?: number;
        movementOverridesSleep?: boolean;
      },
      null
    >,
    travelerGetOldestContent: (anyApi as any).travelerPreferences.travelerGetOldestContent as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      OldestContentRef
    >,
    travelerCountContentBeforeCutoff: (anyApi as any).travelerPreferences.travelerCountContentBeforeCutoff as FunctionReference<
      "query",
      "public",
      { token: string; cutoffAt: number; tripId?: string },
      ContentBeforeCutoffCounts
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
      { token: string; tripId?: string },
      JournalEvent[]
    >,
    getJournalUnreadCount: (anyApi as any).journalEvents.getJournalUnreadCount as FunctionReference<
      "query",
      "public",
      { token: string; after: number; tripId?: string },
      number
    >,
    getStoryEventByCheckpoint: (anyApi as any).journalEvents.getStoryEventByCheckpoint as FunctionReference<
      "query",
      "public",
      { token: string; checkpointId: string; tripId?: string },
      JournalEvent | null
    >,
    listReplayStoryEvents: (anyApi as any).journalEvents.listReplayStoryEvents as FunctionReference<
      "query",
      "public",
      {
        token: string; includeLocationless?: boolean;
        paginationOpts: PaginationOpts;
        startAt?: number;
        endAt?: number;
        direction: "asc" | "desc";
        tripId?: string;
      },
      ReplayStoryPage
    >,
    resolveReplayResumeTarget: (anyApi as any).journalEvents.resolveReplayResumeTarget as FunctionReference<
      "query",
      "public",
      { token: string; eventId: string; tripId?: string },
      ReplayResumeTarget
    >,
  },
  endTrip: {
    travelerEndTrip: (anyApi as any).endTrip.travelerEndTrip as FunctionReference<
      "mutation",
      "public",
      { token: string; thankYouNote?: string; tripId?: string },
      null
    >,
    travelerReopenTrip: (anyApi as any).endTrip.travelerReopenTrip as FunctionReference<
      "mutation",
      "public",
      { token: string; tripId?: string },
      null
    >,
    getTripFinaleStatus: (anyApi as any).endTrip.getTripFinaleStatus as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      { ended: boolean; endedAt?: number }
    >,
    getTripCredits: (anyApi as any).endTrip.getTripCredits as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      TripCredits
    >,
  },
  scoring: {
    getScoreSummary: (anyApi as any).scoring.getScoreSummary as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      ScoreSummary | null
    >,
    listAchievementHistory: (anyApi as any).scoring.listAchievementHistory as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      AchievementEvent[]
    >,
    listUnseenAchievements: (anyApi as any).scoring.listUnseenAchievements as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      AchievementEvent[]
    >,
    listUntoastedAchievements: (anyApi as any).scoring.listUntoastedAchievements as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      AchievementEvent[]
    >,
    recordDailyVisit: (anyApi as any).scoring.recordDailyVisit as FunctionReference<
      "mutation",
      "public",
      { token: string; localDateKey: string; tripId?: string },
      null
    >,
    markAchievementsToasted: (anyApi as any).scoring.markAchievementsToasted as FunctionReference<
      "mutation",
      "public",
      { token: string; ids: string[]; tripId?: string },
      null
    >,
    markAchievementsSeen: (anyApi as any).scoring.markAchievementsSeen as FunctionReference<
      "mutation",
      "public",
      { token: string; tripId?: string },
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
      { token: string; sourceType: AttributionSourceType; sourceId: string; tripId?: string },
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
        tripId?: string;
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
      { token: string; tripId?: string },
      BadgeBoard | null
    >,
    travelerGetBadgeAwardContext: (anyApi as any).badges.travelerGetBadgeAwardContext as FunctionReference<
      "query",
      "public",
      { token: string; sourceType: BadgeSourceType; sourceId: string; tripId?: string },
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
        tripId?: string;
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
    getInviteStatus: (anyApi as any).followers.getInviteStatus as FunctionReference<
      "query",
      "public",
      { inviteToken: string },
      InviteStatus
    >,
    getEffectiveTrip: (anyApi as any).followers.getEffectiveTrip as FunctionReference<
      "query",
      "public",
      { token: string },
      EffectiveTrip | null
    >,
  },
  followerAdmin: {
    createInvite: (anyApi as any).followerAdmin.createInvite as FunctionReference<
      "mutation",
      "public",
      { token: string; mode?: "single" | "multi" },
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
  cloakingPins: {
    travelerListCloakingPins: (anyApi as any).cloakingPins.travelerListCloakingPins as FunctionReference<
      "query",
      "public",
      { token: string },
      CloakingPin[]
    >,
    travelerAddCloakingPin: (anyApi as any).cloakingPins.travelerAddCloakingPin as FunctionReference<
      "mutation",
      "public",
      { token: string; lat: number; lon: number; radiusMeters: number; label?: string },
      string
    >,
    travelerUpdateCloakingPin: (anyApi as any).cloakingPins.travelerUpdateCloakingPin as FunctionReference<
      "mutation",
      "public",
      { token: string; pinId: string; radiusMeters: number; label?: string },
      null
    >,
    travelerDeleteCloakingPin: (anyApi as any).cloakingPins.travelerDeleteCloakingPin as FunctionReference<
      "mutation",
      "public",
      { token: string; pinId: string },
      null
    >,
  },
  travelFunds: {
    travelerGetConfig: (anyApi as any).travelFunds.travelerGetConfig as FunctionReference<
      "query",
      "public",
      { token: string; currentLocalDayStart?: number; tripId?: string },
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
      { token: string; limit?: number; tripId?: string },
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
      { token: string; transactionId: string; tripId?: string },
      null
    >,
    followerGetFundsSummary: (anyApi as any).travelFunds.followerGetFundsSummary as FunctionReference<
      "query",
      "public",
      { token: string; currentLocalDayStart?: number; tripId?: string },
      TravelFundsSummaryForFollower
    >,
    followerListVisibleTransactions: (anyApi as any).travelFunds.followerListVisibleTransactions as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      TransactionForFollower[]
    >,
    getLinkedCostMap: (anyApi as any).travelFunds.getLinkedCostMap as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      LinkedCostMap
    >,
    travelerListTransactionsForTarget: (anyApi as any).travelFunds.travelerListTransactionsForTarget as FunctionReference<
      "query",
      "public",
      { token: string; targetType: "mission" | "checkpoint"; targetId: string; tripId?: string },
      Transaction[]
    >,
    travelerListUnlinkedTransactions: (anyApi as any).travelFunds.travelerListUnlinkedTransactions as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      Transaction[]
    >,
  },
  messages: {
    listMessages: (anyApi as any).messages.listMessages as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      Message[]
    >,
    sendMessage: (anyApi as any).messages.sendMessage as FunctionReference<
      "mutation",
      "public",
      { token: string; text: string; tripId?: string },
      null
    >,
    deleteMessage: (anyApi as any).messages.deleteMessage as FunctionReference<
      "mutation",
      "public",
      { token: string; messageId: string; tripId?: string },
      null
    >,
  },
  ticker: {
    getTickerSettings: (anyApi as any).ticker.getTickerSettings as FunctionReference<
      "query",
      "public",
      { token: string; tripId?: string },
      TickerSettings
    >,
    updateTickerSettings: (anyApi as any).ticker.updateTickerSettings as FunctionReference<
      "mutation",
      "public",
      {
        token: string;
        enabled?: boolean;
        funFactsEnabled?: boolean;
        tipsEnabled?: boolean;
        funFactIntervalMinutes?: number;
        funFactWeight?: number;
        tipWeight?: number;
        showPriorityToFollowers?: boolean;
        showFunFactsToFollowers?: boolean;
        showTipsToFollowers?: boolean;
        tripId?: string;
      },
      null
    >,
    addTickerMessage: (anyApi as any).ticker.addTickerMessage as FunctionReference<
      "mutation",
      "public",
      { token: string; type: "priority" | "fact" | "tip"; text: string; tripId?: string },
      string
    >,
    removeTickerMessage: (anyApi as any).ticker.removeTickerMessage as FunctionReference<
      "mutation",
      "public",
      { token: string; messageId: string; tripId?: string },
      null
    >,
    clearAllTickerMessages: (anyApi as any).ticker.clearAllTickerMessages as FunctionReference<
      "mutation",
      "public",
      { token: string; tripId?: string },
      null
    >,
  },
  reactions: {
    toggleReaction: (anyApi as any).reactions.toggleReaction as FunctionReference<
      "mutation",
      "public",
      {
        token: string;
        /** ID of the checkpoint / mission / route vote being reacted to. */
        targetId: string;
        targetType: ReactionTargetType;
        emoji: string;
        tripId?: string;
      },
      null
    >,
  },
  trips: {
    listTravelerTripCards: (anyApi as any).trips.listTravelerTripCards as FunctionReference<
      "query",
      "public",
      { token: string; paginationOpts: PaginationOpts; search?: string; lifecycle?: TripLifecycle },
      TripCardPage
    >,
    getTripPreview: (anyApi as any).trips.getTripPreview as FunctionReference<
      "query",
      "public",
      { token: string; tripId: string },
      TripPreview
    >,
    requestTripPreviewRefresh: (anyApi as any).trips.requestTripPreviewRefresh as FunctionReference<
      "mutation",
      "public",
      { token: string; tripId: string },
      null
    >,
    createTrip: (anyApi as any).trips.createTrip as FunctionReference<
      "mutation",
      "public",
      CreateTripArgs,
      { tripId: string }
    >,
    updateTrip: (anyApi as any).trips.updateTrip as FunctionReference<
      "mutation",
      "public",
      { token: string; tripId: string; expectedRevision: number; patch: TripDetailsPatch },
      { revision: number }
    >,
    getCurrentTrip: (anyApi as any).trips.getCurrentTrip as FunctionReference<
      "query",
      "public",
      { token: string },
      CurrentTrip | null
    >,
    setCurrentTrip: (anyApi as any).trips.setCurrentTrip as FunctionReference<
      "mutation",
      "public",
      { token: string; tripId: string; expectedRevision: number },
      CurrentTrip
    >,
    setLifecycle: (anyApi as any).trips.setLifecycle as FunctionReference<
      "mutation",
      "public",
      { token: string; tripId: string; lifecycle: TripLifecycle },
      { lifecycle: TripLifecycle; revision: number }
    >,
    getSwitchImpact: (anyApi as any).trips.getSwitchImpact as FunctionReference<
      "query",
      "public",
      { token: string; tripId: string },
      TripSwitchImpact
    >,
    resolveTripAt: (anyApi as any).trips.resolveTripAt as FunctionReference<
      "query",
      "public",
      { token: string; at: number },
      { tripId: string } | null
    >,
    deleteTrip: (anyApi as any).trips.deleteTrip as FunctionReference<
      "mutation",
      "public",
      { token: string; tripId: string },
      null
    >,
  },
} as const;

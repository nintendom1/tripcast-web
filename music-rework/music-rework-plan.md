# Music Rework Plan 

## Context
The OST present is placeholder music. 

## Current OST

These are not audio-file “songs.” tripcast-web/src/lib/audio/engine.ts:66 defines synthesized Web Audio progressions, then
tripcast-web/src/lib/audio/engine.ts:332 continuously schedules pads, bass, and piano arps.

Option               When It Plays
━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
auto / Auto          Default. Follows app scenario via tripcast-web/src/lib/audio/engine.ts:141.
idle / Calm          Manual override only, or Auto fallback when no higher-priority scenario is active.
happy / Happy        Manual override only. No automatic app state selects it.
morning / Morning    Manual override only. No automatic app state selects it.
cafe / Cafe          Manual override only. No automatic app state selects it.
story / Story        Manual override, or Auto when a story detail/form is open.
vote / Vote          Manual override, or Auto when route vote UI is open or there is an unseen active vote.
mission / Mission    Manual override, or Auto when Missions is open or traveler has proposed mission badge count.

There is also an unlisted overBudget progression in tripcast-web/src/lib/audio/engine.ts:130. It plays only in Auto when
Travel Funds are enabled and remainingUsd < 0.

Auto Priority

Auto scenario priority is in tripcast-web/src/lib/audio/useTripAudioScenario.ts:28:

1. story
2. overBudget
3. voteActive -> vote
4. missionActive -> mission
5. idle

The booleans are supplied from tripcast-web/src/features/map/TripMap.tsx:1339:

- storyOpen: selectedStoryEvent !== null || storyPrefill !== null
- voteActive: isVotePanelOpen || hasUnseenVote
- missionActive: isMissionsPanelOpen || missionBadgeCount > 0

missionBadgeCount is traveler-only proposed missions in tripcast-web/src/features/map/TripMap.tsx:1285.

Orchestration

- tripcast-web/src/main.tsx:15 wraps the app in MusicProvider.

- tripcast-web/src/lib/audio/useTripAudioScenario.ts:47 computes scenario from TripMap state plus Travel Funds queries.
- tripcast-web/src/lib/audio/engine.ts:328 converts scenario + soundtrack selection into a progression.

Gating / Suppression

The soundtrack can be silent even when a progression is selected:

- Engine starts only after first user gesture: tripcast-web/src/lib/audio/engine.ts:188.
- Login/no session suppresses music: tripcast-web/src/App.tsx:150.
- Create-account intro suppresses until the tour starts: tripcast-web/src/features/onboarding/IntroSequence.tsx:410.
- Full-screen error fallback suppresses music after playing bubble: tripcast-web/src/components/resilience/
ErrorFallbacks.tsx:19.

- Hard mute suppresses soundtrack and SFX; named suppression suppresses soundtrack but SFX still fire.

Key rework note: happy, morning, and cafe are currently pure manual moods. If they need contextual behavior, the
orchestration point is deriveTripAudioScenario plus resolveSoundtrackScenario, or a replacement for that split.
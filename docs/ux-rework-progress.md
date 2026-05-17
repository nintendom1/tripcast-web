## Generative Music Engine

- **Date:** 2026-05-17

### Summary of Files Changed
- `src/lib/audio/engine.ts`: Expanded idle auto scenario soundtrack resolution with time-of-day variants for evening and midnight windows.
- `src/lib/audio/engine.test.ts`: Added a test for nighttime/midnight idle auto soundtrack selection windows.

### Music Soundtrack Names and Playback Context
- **Kisaragi Morning** (`morning`): Calm morning ambience with soft pentatonic lead and gentle pad.
- **Station Cafe Loop** (`cafe`): Relaxed browsing loop with mellow chords and light arpeggio ticks.
- **Maple Idle Theme** (`idle`): Default map-view idle loop for daytime.
- **Akari Night Walk** (`night`): Evening idle loop, used in `auto` idle mode from 7pm onward.
- **Midnight Lantern** (`midnight`): Very soft late-night idle loop, used in `auto` idle mode from 12am to 6am.
- **Sunlit Choice** (`happy`): Brighter uplifting motif for explicitly happy soundtrack selection.
- **Turning Page** (`story`): Sparse emotional reading cue for story context.
- **Vote Clock Waltz** (`vote`): Subtle tension pulse for active route voting context.
- **Mission Footsteps** (`challenge`): Slightly forward arpeggio and low pulse for challenge/mission context.

### SFX Names and Trigger Context
- `tap`: Tiny UI tap blip.
- `open`: Rising two-note chime for opening UI flows.
- `close`: Falling two-note chime for closing UI flows.
- `pin`: Bright pluck for map pin placement.
- `vote`: Confirm sparkle for vote actions.
- `success`: Short ascending motif for successful actions.
- `page`: Soft page-turn sweep/tick.
- `toast`: Gentle bell for notifications.

### Tests Run and Results
- `npm run typecheck` (pass)
- `npm run test` (pass)

### Gitleaks Status
- `gitleaks` is unavailable in this environment (`command -v gitleaks` not found), so local staged diff scanning could not be run.
- Relying on the repository's GitHub Actions Gitleaks workflow for remote secret scanning.

### Issues / Deferred Follow-up
- None.

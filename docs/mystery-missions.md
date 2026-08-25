# Mystery Missions

Mystery Missions are Traveler-imported proximity signals. They do not call an LLM. The backend stores the full Mystery Mission record separately and creates a linked normal Mission row so unlocked mysteries can use the same list, map, start, active, and completion workflow as other Missions.

## Visibility

- Imported dormant Mystery Missions are visible only in Traveler management.
- Eligible Mystery Missions appear as linked normal Mission rows in the normal Mission list and on the map for both roles.
- The linked Mission skips Proposed and displays `visible`/`planned` as Unlocked, `in_progress` as Active, and `completed` as Completed.
- `trueIntent`, exact `locationName`, and spoiler summaries stay hidden until completion.
- Completed Mystery Missions remain visible as revealed Mission rows, but their map pins disappear like other completed Mission pins so the completed Story pin can surface.
- Dismissed Mystery Missions are Traveler-management/debug data and do not appear to Followers.

## Proximity and Debug Pins

Mystery Missions use two independent radii:

- `spawnRadiusMiles` controls when the backend unlocks a dormant signal.
- `resolveRadiusMeters` controls automatic completion after physical arrival. It defaults to exactly 75 meters and accepts positive values through 5,000 meters.

Normal visibility uses fresh shared Traveler location, the spawn radius, expiration, completion/dismissal state, and high-velocity suppression. If live location is stale or paused, dormant Mystery pins do not spawn.

On native iOS, automatic arrival requires both Mystery Missions and TripCast Live. iOS uses the existing Adaptive Location session rather than a second location manager. A fix qualifies when it is no more than two minutes old, has valid horizontal accuracy no worse than 50 meters, and `distance to destination + horizontal accuracy <= resolveRadiusMeters`. One qualifying fix is sufficient. Simultaneous arrivals are resolved by nearest raw distance, then higher Mystery priority, then stable pack ID. The default reveal cadence is one minute; the Traveler configures it in whole-minute increments.

Options -> Mystery Missions includes **Debug: show all map pins**. This is Traveler-only and local to the browser via `localStorage`. Dormant pins carry a visible amber **D** badge and a “Traveler debug preview” label. While the toggle is on, native iOS also caches those dormant pins. Reaching one narrates and completes it through the debug-arrival path without first adding it to the normal reveal cadence. Mystery Missions must still be globally enabled.

Options -> Developer -> **Create Test Mystery Pin** gives the Traveler a repeatable native-audio test fixture without importing a pack. The sheet accepts separate Mystery pin and spoken-reveal text, includes a tourist-style autofill, and captures one high-accuracy browser location fix when Create is pressed. If needed, confirmation enables Mystery Missions for the trip and debug Mystery pins on that browser. It intentionally does not turn TripCast Live on; after creating with Live off, close Options and turn Live on from the map so native proximity can evaluate the pin on the next qualifying location fix.

Developer test pins remain Traveler-only before and after completion. They appear in the Traveler Mission list/detail and Mystery Mission management, and appear on the map only as debug Mystery pins. They do not consume normal reveal cadence, appear to Followers, or enter Mystery Mission and bulk exports. Deleting one from either Mission detail or Mystery Mission management removes both the test Mystery record and its linked Mission, including after completion.

Unlocked Mystery Mission map pins are normal Mission pins with a darker greyscale color treatment. Debug dormant pins still use the fizzle decoration plus the debug badge; the overlay is only rendered when the debug toggle is on and excludes completed Mysteries.

## Reveal Feedback

When the Traveler completes a linked Mystery Mission, the backend marks the Mystery record revealed. Traveler no-story and Story-completion paths show the greyscale reveal toast and success sound. Followers receive the same completed Mission state through the normal Mission subscriptions.

On native iOS, an eligible mission is cached locally and can resolve without the WebView or network while TripCast is foregrounded, backgrounded, suspended, or locked. iOS durably records the trigger before narration or network work, narrates `trueIntent`, and retries the canonical completion mutation until it receives a terminal result. Completion updates the linked normal Mission directly and never creates a checkpoint, Story, journal Story, or feed item. If React is active at arrival it plays the existing success sound and shows “Mystery Mission revealed.” once; foregrounding later does not replay that feedback.

The Traveler's native iOS Mission detail includes play/pause, resume, restart, and read-only spoken-text progress. These controls are not rendered for Followers. Manual playback works even when automatic arrival narration is muted, and using it does not change the automatic-audio preference. Narration continues if the Mission sheet closes.

The cache is replaced by each authoritative sync. A cached unlocked mission remains eligible offline until its own expiry, so a mission deleted on the server while the phone is offline can produce one stale narration. The completion endpoint refuses to resurrect it, and the next sync removes it.

## Management

The management sheet is spoiler-safe by default. In Spoiler Safe mode, the list uses generic “Mystery Signal” labels and exposes practical metadata plus edit/delete controls.

The Traveler full-data edit sheet is reachable from:

- Options -> Mystery Missions -> Imported signals -> Edit.
- Mission list -> select an unlocked Mystery Mission -> Edit.
- Map pin -> select an unlocked Mystery Mission -> Edit.

The full-data editor intentionally shows all fields, including `mysteryText`, `trueIntent`, coordinates, timing, tags, and spoiler metadata. Editing a Mystery Mission also updates its linked Mission's safe public fields without resetting lifecycle progress.

On native iOS, the management sheet includes a device-local **Automatic audio reveals** preference, on by default, and a non-spoiler **Test audio** action. Muting stops current narration, drops queued narration, and does not stop mission completion. Unmuting affects future arrivals only. iOS 17 and newer also expose this control on the Lock Screen Live Activity and expanded Dynamic Island; compact and minimal presentations stay icon-only.

`trueIntent` supports up to 3,000 JavaScript string characters in Mystery packs, bulk import, and the editor.

## Reset And Bulk Data

Emergency Reset deletes imported Mystery Missions, their linked Mission rows, and Mystery Mission settings.

Bulk Import supports `kind: "mystery_mission"` entries with the same core fields as a Mystery Mission pack: stable `id`, coordinates, `mysteryText`, `trueIntent`, radius, priority, tags, timing, and spoiler metadata. Imported Mystery Missions upsert by stable id and update their linked Mission rows.

Bulk Export excludes Mystery Missions by default. The Traveler can enable **Include Mystery Missions** to export full Mystery Mission definitions, including true intent and spoiler metadata. Derived linked Mission rows are not exported as ordinary Missions, which prevents duplicate rows on round-trip import.

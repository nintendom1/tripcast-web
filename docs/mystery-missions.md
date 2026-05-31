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

Normal visibility uses fresh shared Traveler location, radius, expiration, completion/dismissal state, and high-velocity suppression. If live location is stale or paused, dormant Mystery pins do not spawn.

Options -> Mystery Missions includes **Debug: show all map pins**. This is Traveler-only and local to the browser via `localStorage`. It shows dormant imported pins on the map as unrevealed `signal` pins, bypassing proximity and velocity checks, so the Traveler can plan a walk without unlocking, revealing, starting, or completing anything.

Unlocked Mystery Mission map pins are normal Mission pins with a darker greyscale color treatment. Debug dormant pins still use the fizzle decoration, but the overlay is only rendered when the debug toggle is on and excludes completed Mysteries.

## Reveal Feedback

When the Traveler completes a linked Mystery Mission, the backend marks the Mystery record revealed. Traveler no-story and Story-completion paths show the greyscale reveal toast and success sound. Followers receive the same completed Mission state through the normal Mission subscriptions.

## Management

The management sheet is spoiler-safe by default. In Spoiler Safe mode, the list uses generic “Mystery Signal” labels and exposes practical metadata plus edit/delete controls.

The Traveler full-data edit sheet is reachable from:

- Options -> Mystery Missions -> Imported signals -> Edit.
- Mission list -> select an unlocked Mystery Mission -> Edit.
- Map pin -> select an unlocked Mystery Mission -> Edit.

The full-data editor intentionally shows all fields, including `mysteryText`, `trueIntent`, coordinates, timing, tags, and spoiler metadata. Editing a Mystery Mission also updates its linked Mission's safe public fields without resetting lifecycle progress.

## Reset And Bulk Data

Emergency Reset deletes imported Mystery Missions, their linked Mission rows, and Mystery Mission settings.

Bulk Import supports `kind: "mystery_mission"` entries with the same core fields as a Mystery Mission pack: stable `id`, coordinates, `mysteryText`, `trueIntent`, radius, priority, tags, timing, and spoiler metadata. Imported Mystery Missions upsert by stable id and update their linked Mission rows.

Bulk Export excludes Mystery Missions by default. The Traveler can enable **Include Mystery Missions** to export full Mystery Mission definitions, including true intent and spoiler metadata. Derived linked Mission rows are not exported as ordinary Missions, which prevents duplicate rows on round-trip import.

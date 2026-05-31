# Mystery Missions

Mystery Missions are Traveler-imported proximity signals. They are not normal Missions and they do not call an LLM. The backend stores them separately, then exposes redacted feed/map rows so Travelers and Followers can be surprised by black/grey pins without seeing `trueIntent` early.

## Visibility

- Imported dormant Mystery Missions are visible only in Traveler management.
- Eligible Mystery Missions appear in the normal Mission list and on the map for both roles.
- `trueIntent`, exact `locationName`, and spoiler summaries stay hidden until completion.
- Completed Mystery Missions remain visible as revealed greyscale Mission rows and map pins.
- Dismissed Mystery Missions are Traveler-management/debug data and do not appear to Followers.

## Proximity and Debug Pins

Normal visibility uses fresh shared Traveler location, radius, expiration, completion/dismissal state, and high-velocity suppression. If live location is stale or paused, dormant Mystery pins do not spawn.

Options -> Mystery Missions includes **Debug: show all map pins**. This is Traveler-only and local to the browser via `localStorage`. It shows dormant imported pins on the map as unrevealed `signal` pins, bypassing proximity and velocity checks, so the Traveler can plan a walk without spoiling or completing anything.

## Reveal Feedback

When a Mystery Mission transitions to revealed while the app is open, the map marker subscription fires a greyscale toast and success sound for both Travelers and Followers. Traveler no-story and Story-completion paths also show the greyscale reveal toast.

## Management

The management sheet is spoiler-safe by default. In Spoiler Safe mode, the list uses generic “Mystery Signal” labels and exposes practical metadata plus edit/delete controls. Turning Spoiler Safe off reveals and allows editing `mysteryText`, `trueIntent`, and exact location name.

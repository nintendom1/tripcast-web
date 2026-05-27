# Debug Logging

Read when changing debug UI/logging or when using logs to reproduce a UI bug.

TripCast includes a local-only debug logger surfaced through Options -> Developer -> Dev Tools. Logging is off by default and persists in `localStorage` when enabled.

## Rules

- Never log auth tokens, passwords, secrets, API keys, email addresses, phone numbers, raw typed titles, notes, captions, Convex payloads, or backend responses.
- Keep redaction and caps intact: depth 4, arrays 10 items, strings 200 chars, buffer 500 entries.
- Logs stay local unless the user explicitly copies or downloads them.
- Preserve "Copy LLM Summary" as the compact debugging artifact for agent conversations.

## Expected Coverage

The logger should capture sheet/panel open and close events, Dock and FanMenu actions, panel view changes, filter changes, form submit attempts/results, global errors, unhandled rejections, and React render errors. Incorporate logging when planning if applicable, especially on new features.

## Map Focus Centering (observability + "teach by dragging")

When a focused pin (mission/journal/story/replay) is moved into view, all triggers route through `src/features/map/focusCoordinate.ts`, which clamps the pin to the **center of the visible band** between the status card and the active bottom sheet. The result is observable through a three-event triad (category `map`):

- **`map:camera:focus`** — fired before the move. Carries the full geometry: `viewport`, `topOccluder`, `bottomOccluder` (with `source` selector), `band` ({top,height} in map-local px), `target` screen point, `anchor`, computed `padding`, and `zoom`.
- **`map:camera:focus:settled`** — fired on the programmatic `moveend`. Reports where the pin **actually** landed: `screen` px, `bandFraction` ({x,y}), and `occluded`. **`bandFraction` is the artifact to read** — `x` is the fraction across the full width, `y` is the fraction down the visible band. Ideal ≈ `{ x: 0.50, y: 0.50 }`. e.g. `{ y: 0.72 }` means the pin sits 72% down the band (too low).
- **`map:camera:focus:user-adjust`** — fired if you pan the map within ~8s of a focus. Reports `deltaPx`, `fromBandFraction`, `toBandFraction`, and `impliedAnchor`.

### SOP: teach the LLM the desired centering

1. Open the map-linked sheet (Mission / Story / Votes) so the pin auto-focuses.
2. **Drag the map** so the pin sits exactly where you want it.
3. Copy the single `map:camera:focus:user-adjust` log line and paste it to the LLM.
4. `impliedAnchor` is the exact tuning target — the LLM updates `ANCHOR` (or a per-trigger anchor) in `focusCoordinate.ts` to match.

The vocabulary is shared: "the pin should land at `bandFraction y: 0.4`" is unambiguous, where prose like "a bit higher" is not.

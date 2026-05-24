# Terminology

Read when changing UI copy, user-facing terms, terminology lint rules, or terminology baselines.

TripCast terms:

| Term | Usage |
|---|---|
| Traveler | Primary trip manager. |
| Follower | Support crew viewer/voter. |
| Route Vote | Destination proposal and voting feature. |
| Emergency Reset | Traveler-only data wipe flow. |

## Linting

- Web and backend each have `terminology.config.json` and `terminology-baseline.json`.
- `npm run validate` runs `lint:terms:report`, which prints findings but exits 0.
- `npm run lint:terms` enforces new violations against the baseline.
- `npm run lint:terms:baseline` regenerates the checked-in baseline after an intentional cleanup slice.

The linter is scoped to shipping copy and avoids churn in tests, scripts, generated code, and ordinary prose. Keep web and backend terminology rules aligned when adding or changing shared terms.

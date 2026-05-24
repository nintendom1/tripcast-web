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

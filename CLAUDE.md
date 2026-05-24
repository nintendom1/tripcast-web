# Claude Adapter
@AGENTS.md

## Planning Mode Behavior
- When in planning mode, **ask clarifying questions** to probe for edge cases. Do not finalize a plan until requirements are stable.
- **Special Technical Gotchas**: For `framer-motion`, use an explicit `motion: { div: ... }` object. Do NOT use a Proxy.
- Recover: If the user says "Recover", speak normally.
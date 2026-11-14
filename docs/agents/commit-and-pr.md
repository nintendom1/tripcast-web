# Commit & PR Protocol

## Commits

* Prefix, lowercase type/scope: `feat: `, `fix: `, `docs: `, `chore: `, `refactor: `, `dev: `.
* Subject after the colon: imperative Title Case.
* Body:

```text
Before, <previous state or problem. Focus on the User Experience if applicable>.
Now, <new state or outcome. Focus on the User Experience if applicable>.
```

## Pull Requests

* Title: same style as a commit subject.
* Body:

```text
<Before/After commit body style.>

## Summary
<Up to several technical bullets.>

## Testing
<Commands run, manual checks by you and/or a reviewer, or why testing was not run.>
```

* The opening Before/Now covers the whole branch's product outcome, not each commit.
* Keep it user-facing: no helper names, hooks, files, tests, algorithms, or query names unless needed to explain the outcome.
* Mention Traveler/Follower impact only when the roles differ, in one sentence.
* Technical details, commit notes, test commands, and file changes go in Summary or Testing.

## Example

```text
Before, Travelers and Followers opened the app to the Seattle fallback even when the trip had better location context. The map felt disconnected until the user centered it.
Now, Travelers open near their current location when permission is available, and Followers open near the Traveler's live location or latest valid pin. The map starts close to the trip without a tap.

## Summary
- Added launch-centering for Traveler and Follower map views.
- Kept manual centering and follow mode after launch.

## Testing
- npm run validate
- Manually verified launch with location permission on and off.
```

# Backend Changes for Story Photo Sizing

To support the new Story photo sizing controls, the following changes are required in the Convex backend.

## Schema Changes

Add the `imageSize` field to the following tables/types:

### `checkpoints` table
- `imageSize`: optional string, one of: `"compact"`, `"medium"`, `"large"`.

### `journalEvents` table
- `imageSize`: optional string, one of: `"compact"`, `"medium"`, `"large"`.

## Mutation Changes

### `checkpoints.addCheckpoint`
- Accept `imageSize` in the arguments.
- Store `imageSize` on the new `checkpoint` document.
- When emitting the `journalEvent` for the story, include the `imageSize` in the event document.

### `checkpoints.updateCheckpoint`
- Accept `imageSize` in the arguments.
- Update the `imageSize` on the `checkpoint` document.
- Find the linked `journalEvent` and update its `imageSize` field to match.

### `missions.travelerCompleteMissionAsStory`
- Accept `imageSize` in the arguments.
- Store `imageSize` on the new `checkpoint` document.
- When emitting the `journalEvent` for the story, include the `imageSize` in the event document.

## Query Changes

Ensure that `journalEvents` and `checkpoints` returned by queries include the `imageSize` field if it exists.
